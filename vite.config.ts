/**
 * 画面のビルドの設定。
 *
 * - Vue に移行した画面：ルートの HTML（例：admin/organization.html）を PAGES に追加する
 * - まだ移行していない画面：legacy/ に置く。そのままの形で dist/ にコピーされ、同じ URL で開ける
 * - 画面を返すのは、開発時も公開時も nginx（deploy/nginx/）。/api は nginx が FastAPI に転送する
 *   （開発時は npm run dev が nginx を起動し、保存するたびに dist/ を作り直す。Vite の開発サーバーは使わない）
 * - preview（画面の自動テストで使う）だけは Vite が画面を返し、/api を FastAPI に転送する
 */
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { SECURITY_HEADERS } from "./security-headers.ts";

/** Vue に移行した画面（出力先のパス → HTML） */
const PAGES: Record<string, string> = {
  "admin/organization": "admin/organization.html",
};

/** preview で /api を転送する先（FastAPI）。環境変数 API_URL で変えられる */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => ({
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
    // 開発時（npm run dev）は、ブラウザの開発者ツールで元の .vue / .ts を見られるようにする
    sourcemap: mode === "development",
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, html]) => [name, path(html)])),
    },
  },
}));
