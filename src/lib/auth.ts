// ログイン状態と権限に応じて、表示してよい画面かどうかを判断し、必要なら移動させる。
// ※ 画面側のチェックは使いやすさのため。実際の権限チェックは API 側で行っている。
import { ApiError, authApi } from "@/api";
import type { Me, Role } from "@/types/api";

export const PATHS = {
  login: "/login.html",
  setup: "/setup.html",
  masterHome: "/admin/users.html",
  generalHome: "/map.html",
} as const;

export async function loadMe(): Promise<Me | null> {
  try {
    return await authApi.me();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function needsSetup(me: Me): boolean {
  return me.role === "general" && (me.must_change_password || !me.profile_completed);
}

export function homePathFor(me: Me): string {
  if (me.role === "master") return PATHS.masterHome;
  if (needsSetup(me)) return PATHS.setup;
  return PATHS.generalHome;
}

/** 画面を移動する。移動が終わるまで後続の処理を止めるため、解決しない Promise を返す */
export function redirect(path: string): Promise<never> {
  window.location.replace(path);
  return new Promise(() => {});
}

export interface AuthOptions {
  /** この画面を使える権限（省略時はどちらでも可） */
  role?: Role;
  /** 初回設定画面のときだけ true */
  setupPage?: boolean;
}

/** ログイン済みでなければログイン画面へ移動する。ログイン中のユーザー情報を返す */
export async function requireAuth({ role, setupPage = false }: AuthOptions = {}): Promise<Me> {
  const me = await loadMe();
  if (!me) return redirect(PATHS.login);
  if (role && me.role !== role) return redirect(homePathFor(me));
  if (setupPage !== needsSetup(me)) return redirect(homePathFor(me));
  return me;
}

/** ログイン・新規登録画面用。すでにログインしていればホームへ移動する */
export async function redirectIfLoggedIn(): Promise<void> {
  const me = await loadMe();
  if (me) await redirect(homePathFor(me));
}
