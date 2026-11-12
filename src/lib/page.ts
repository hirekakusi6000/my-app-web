// 画面の入口の共通処理：ログインと権限を確認してから、ヘッダー付きで Vue の画面を表示する。
import "@/styles/base.css";
import "@/styles/components.css";

import { type Component, createApp, h } from "vue";

import AppHeader from "@/components/AppHeader.vue";
import { type AuthOptions, redirectIfLoggedIn, requireAuth } from "@/lib/auth";
import { session } from "@/lib/session";

export interface PageOptions {
  /** ログインが必要な画面の条件。false はログイン前の画面（ログイン・新規登録） */
  auth: AuthOptions | false;
  /** ヘッダーのナビゲーションを表示するか（初回設定画面では表示しない） */
  nav?: boolean;
}

export async function mountPage(page: Component, { auth, nav = true }: PageOptions): Promise<void> {
  if (auth === false) {
    await redirectIfLoggedIn();
    createApp(page).mount("#app");
    return;
  }

  session.me = await requireAuth(auth);
  createApp({
    render: () => [h(AppHeader, { nav }), h(page)],
  }).mount("#app");
}
