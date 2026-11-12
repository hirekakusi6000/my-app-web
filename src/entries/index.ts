// トップページは、ログイン状態に応じて適切な画面へ振り分けるだけ。
import { homePathFor, loadMe, PATHS } from "@/lib/auth";

const me = await loadMe();
window.location.replace(me ? homePathFor(me) : PATHS.login);
