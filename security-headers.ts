/**
 * 画面に付けるセキュリティヘッダー。
 *
 * 公開時はリバースプロキシ（Caddy・nginx など）で同じヘッダーを付ける（my-app-docs の web/README.md の「公開」を参照）。
 * `npm run preview` と画面の自動テストでも同じヘッダーを付けて、CSP に違反していないかを確かめる。
 * （`npm run dev` では付けない。Vite の開発サーバーはスタイルをインラインで差し込むため）
 */

// 画面はすべて自分のサーバーのファイルだけを使う。インラインのスクリプトやスタイルも許可しない
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // blob: はプロフィール画像を選んだときのプレビュー、data: は SVG 内の画像用
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  // 画面を更新したらすぐ反映されるよう、毎回サーバーに確認させる
  "Cache-Control": "no-cache",
};
