/**
 * 画面のビルドと開発サーバーの設定。
 *
 * - Vue に移行した画面：ルートの HTML（例：admin/organization.html）を PAGES に追加する
 * - まだ移行していない画面：legacy/ に置く。そのままの形で dist/ にコピーされ、同じ URL で開ける
 * - API（/api）：開発サーバーと preview では FastAPI に転送する。公開時はリバースプロキシで振り分ける
 *   （画面と API を同じオリジンにするので、ログインの Cookie と CSP をそのまま使え、CORS も要らない）
 */
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { SECURITY_HEADERS } from "./security-headers.ts";

/** Vue に移行した画面（出力先のパス → HTML） */
const PAGES: Record<string, string> = {
  "admin/organization": "admin/organization.html",
};

/** API サーバー（FastAPI）の URL。環境変数 API_URL で変えられる */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: path("."),
  base: "/",
  // 1ページずつの HTML（SPA ではない）。存在しない URL は index.html ではなく 404 にする
  appType: "mpa",
  publicDir: path("legacy"),
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path("src"),
      // まだ移行していない共通の部品（ヘッダー・API の呼び出しなど）を Vue の画面からも使う
      "@legacy": path("legacy"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: API_URL } },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/api": { target: API_URL } },
    headers: SECURITY_HEADERS,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // 画面のスクリプトは最上位で await を使うため
    target: "es2022",
    // legacy/ の css・js と名前がぶつからないよう、出力をまとめる
    assetsDir: "assets/vue",
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, html]) => [name, path(html)])),
    },
  },
});
