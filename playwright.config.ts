/**
 * 画面の自動テスト（Playwright）の設定。
 *
 * テストごとに、一時フォルダの DB を使う API サーバー（FastAPI）と、ビルドした画面を配信する
 * サーバー（vite preview）を起動する（e2e/fixtures.ts）。先に `npm run build` が必要。
 *
 * API のリポジトリの場所は環境変数で変えられる：
 *   API_DIR    … API のリポジトリのフォルダ（既定: ../my-app）
 *   API_PYTHON … API を動かす Python（既定: API_DIR の .venv の Python。なければ python）
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    // 画面は PC 向け（幅 1280px 以上）なので、広めの画面で操作する
    viewport: { width: 1400, height: 900 },
    locale: "ja-JP",
    // 失敗したテストは、画面のスクリーンショットと操作の記録（trace）を残す
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
