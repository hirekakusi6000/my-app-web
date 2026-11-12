// ログイン中のユーザー（ヘッダーなど、画面のどこからでも参照する）。
import { reactive } from "vue";

import type { Me } from "@/types/api";

export const session = reactive<{ me: Me | null }>({ me: null });

/** ログイン中のユーザー（ログインが必要な画面では、表示する前に必ず設定されている） */
export function currentUser(): Me {
  if (!session.me) throw new Error("ログイン中のユーザーがいません");
  return session.me;
}
