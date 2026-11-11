// 開発用の起動（npm run dev）。公開時と同じ nginx で画面を開く。
//
//   1. 画面をビルドする（dist/）
//   2. nginx を起動する（http://127.0.0.1:8080。/api は FastAPI http://127.0.0.1:8000 に転送）
//   3. ファイルを保存するたびに、dist/ を自動で作り直す（vite build --watch）
//      → ブラウザを再読み込みすると反映される
//   Ctrl + C で、自動のビルドと nginx の両方を止める。
//
// 開発時もセキュリティヘッダー（CSP など）が公開時と同じように付くので、違反があればすぐ分かる。
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const VITE = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const NGINX_SCRIPT = fileURLToPath(new URL("./nginx.mjs", import.meta.url));
const node = (args, options = {}) =>
  spawnSync(process.execPath, args, { cwd: WEB_DIR, stdio: "inherit", ...options });

// 1. 最初のビルド（nginx が返す dist/ を用意する）
console.log("画面をビルドしています…");
if (node([VITE, "build", "--mode", "development", "--logLevel", "warn"]).status !== 0) process.exit(1);

// 2. nginx を起動する（もう起動していれば、そのまま使う）
const started = node([NGINX_SCRIPT, "start"], { stdio: "pipe", encoding: "utf-8" });
process.stdout.write(started.stdout ?? "");
if (started.status !== 0) {
  process.stderr.write(started.stderr ?? "");
  process.exit(1);
}

// 3. 保存するたびにビルドし直す
const watcher = spawn(
  process.execPath,
  [VITE, "build", "--watch", "--mode", "development", "--logLevel", "warn"],
  { cwd: WEB_DIR, stdio: "inherit" },
);
console.log("保存すると自動でビルドし直します（ブラウザは再読み込みで反映）。止めるときは Ctrl + C");

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  watcher.kill();
  node([NGINX_SCRIPT, "stop"]);
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
watcher.on("exit", (code) => stop(code ?? 0));
