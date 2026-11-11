/**
 * 画面の自動テストの共通の準備。
 *
 * テストごとに、一時フォルダの DB を使う API サーバーと画面のサーバーを起動し直す。
 * 新規登録の回数制限やデータが、他のテストに影響しないようにするため。
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type APIRequestContext, test as base, expect, request } from "@playwright/test";
import { preview } from "vite";

export { expect };

export const MASTER_EMAIL = "master@example.com";
export const MASTER_PASSWORD = "master-pass-123";

const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const API_DIR = resolve(WEB_DIR, process.env.API_DIR ?? "../my-app");

function apiPython(): string {
  if (process.env.API_PYTHON) return process.env.API_PYTHON;
  for (const p of [".venv/Scripts/python.exe", ".venv/bin/python"]) {
    if (existsSync(join(API_DIR, p))) return join(API_DIR, p);
  }
  return "python";
}

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => ok(port));
    });
  });
}

/** API サーバー（FastAPI）を起動し、応答するまで待つ。 */
async function startApi(dataDir: string): Promise<{ url: string; process: ChildProcess }> {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    apiPython(),
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port),
      "--log-level", "error", "--no-access-log"],
    {
      cwd: API_DIR,
      env: {
        ...process.env,
        // API のフォルダにある .env より、こちらの値が優先される
        APP_DATABASE_PATH: join(dataDir, "e2e.db"),
        APP_UPLOAD_DIR: join(dataDir, "uploads"),
        APP_COOKIE_SECURE: "false",
        APP_LOG_LEVEL: "ERROR",
        APP_LOG_FILE: join(dataDir, "app.log"),
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderr = "";
  child.stderr?.on("data", (chunk) => (stderr += chunk));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      if ((await fetch(`${url}/api/v1/health`)).ok) return { url, process: child };
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`API サーバーが起動しませんでした（${API_DIR}）\n${stderr}`);
}

/** 準備（データの作成など）に使う API クライアント。マスターとしてログイン済み。 */
export interface Api {
  get(path: string): Promise<any>;
  post(path: string, data?: unknown): Promise<any>;
}

type Fixtures = {
  apiUrl: string;
  consoleErrors: string[];
  api: Api;
  withSample: Api;
};

export const test = base.extend<Fixtures>({
  apiUrl: async ({}, use) => {
    const dataDir = mkdtempSync(join(tmpdir(), "office-e2e-"));
    const api = await startApi(dataDir);
    await use(api.url);
    api.process.kill();
    await new Promise((r) => api.process.once("exit", r));
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },

  // ビルドした画面（dist/）を配信し、/api を上の API サーバーに転送する
  baseURL: async ({ apiUrl }, use) => {
    const server = await preview({
      root: WEB_DIR,
      logLevel: "error",
      preview: { port: await freePort(), strictPort: true, proxy: { "/api": { target: apiUrl } } },
    });
    await use(server.resolvedUrls!.local[0].replace(/\/$/, ""));
    await server.close();
  },

  /**
   * ブラウザのコンソールのエラーと画面のスクリプトの例外を集め、テストの最後に「ない」ことを確かめる。
   * ログイン前の状態確認（GET /me）が 401 を返すのは正常な動きなので除く。
   * CSP に違反した読み込みもコンソールのエラーとして記録される。
   */
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().includes("status of 401")) errors.push(m.text());
      });
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      // confirm() などの確認ダイアログは「OK」を押したことにする
      page.on("dialog", (d) => d.accept());
      await use(errors);
      expect(errors, "ブラウザのコンソールにエラーが出ています").toEqual([]);
    },
    { auto: true },
  ],

  api: async ({ apiUrl }, use) => {
    const ctx: APIRequestContext = await request.newContext({ baseURL: apiUrl });
    const call = async (method: "get" | "post", path: string, data?: unknown) => {
      const res = await ctx[method](`/api/v1${path}`, { data });
      if (!res.ok()) throw new Error(`${method.toUpperCase()} ${path} → ${res.status()} ${await res.text()}`);
      return res.status() === 204 ? null : res.json();
    };
    await call("post", "/auth/signup", {
      organization_name: "テスト株式会社",
      email: MASTER_EMAIL,
      password: MASTER_PASSWORD,
    });
    await use({ get: (path) => call("get", path), post: (path, data) => call("post", path, data) });
    await ctx.dispose();
  },

  /** お試し用のサンプル（オフィスマップと従業員6人）を作成済みの組織。 */
  withSample: async ({ api }, use) => {
    await api.post("/organization/sample-data");
    await use(api);
  },
});

/** ログイン画面から実際にログインする。 */
export async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login.html");
  await page.getByLabel("メールアドレス").fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login.html"));
}
