/**
 * 画面のビルドの設定。
 *
 * - 画面は1ページずつの HTML（マルチページ）。URL と同じパスの HTML（例：admin/users.html）が入口で、
 *   src/entries/ のスクリプトが Vue の画面（src/pages/）を表示する。画面を追加したら PAGES に追加する
 * - 画面を返すのは、開発時も公開時も nginx（deploy/nginx/）。/api は nginx が FastAPI に転送する
 *   （開発時は npm run dev が nginx を起動し、保存するたびに dist/ を作り直す。Vite の開発サーバーは使わない）
 * - preview（画面の自動テストで使う）だけは Vite が画面を返し、/api を FastAPI に転送する
 */
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { SECURITY_HEADERS } from "./security-headers.ts";

/** 画面の一覧（出力先のパス → HTML） */
const PAGES: Record<string, string> = {
  index: "index.html",
  login: "login.html",
  signup: "signup.html",
  setup: "setup.html",
  map: "map.html",
  people: "people.html",
  profile: "profile.html",
  "admin/users": "admin/users.html",
  "admin/offices": "admin/offices.html",
  "admin/map-editor": "admin/map-editor.html",
  "admin/seats": "admin/seats.html",
  "admin/master-data": "admin/master-data.html",
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
  // そのままコピーするファイルはない
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: { "@": path("src") },
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
    assetsDir: "assets/vue",
    // 開発時（npm run dev）は、ブラウザの開発者ツールで元の .vue / .ts を見られるようにする
    sourcemap: mode === "development",
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, html]) => [name, path(html)])),
    },
  },
}));
