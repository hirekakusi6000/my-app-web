// ローカルで nginx を動かす（nginx が dist/ を返し、/api を FastAPI に転送する。公開時と同じ構成）。
// 普段は npm run dev（scripts/dev.mjs）がこのスクリプトで nginx を起動・停止する。
//
// 使い方:
//   npm run nginx:start    … ビルドした dist/ を http://127.0.0.1:8080 で開けるようにする（先にビルドと API の起動が必要）
//   npm run nginx:stop     … 止める
//   npm run nginx:reload   … deploy/nginx/ の設定を変えたあとに読み込み直す
//
// 設定は公開時と同じ deploy/nginx/office-seat/ を使う。違うのは server { } の部分（ポートと dist/ の場所）だけ。
// nginx の作業フォルダ（設定・ログ）は、OneDrive の外の %LOCALAPPDATA%\office-seat-nginx に作る
// （日本語を含むパスを nginx が扱えないことがあるため。dist/ はジャンクションでつなぐ）。
//
// 環境変数:
//   NGINX_PATH … nginx.exe の場所（既定: %LOCALAPPDATA%\Programs\nginx-*\nginx.exe のうち最新。Windows 以外は PATH の nginx）
//   NGINX_PORT … 待ち受けるポート（既定: 8080）
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(WEB_DIR, "dist");
const PORT = Number(process.env.NGINX_PORT ?? 8080);
const isWindows = process.platform === "win32";
const LOCAL = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share");
const PREFIX = join(LOCAL, "office-seat-nginx");

function findNginx() {
  if (process.env.NGINX_PATH) return process.env.NGINX_PATH;
  if (!isWindows) return "nginx";
  const programs = join(LOCAL, "Programs");
  const versions = existsSync(programs)
    ? readdirSync(programs).filter((d) => /^nginx-\d/.test(d)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    : [];
  const exe = versions.length ? join(programs, versions.at(-1), "nginx.exe") : "";
  if (!exe || !existsSync(exe)) {
    console.error("nginx が見つかりません。%LOCALAPPDATA%\\Programs\\nginx-<版>\\ に入れるか、NGINX_PATH で指定してください");
    process.exit(1);
  }
  return exe;
}

const NGINX = findNginx();
// nginx の設定ファイルの中のパスは / 区切りで書く
const slash = (p) => p.replaceAll("\\", "/");

/** nginx を実行する。-p で作業フォルダ、-c で設定ファイルを指定する */
function run(args) {
  return spawnSync(NGINX, ["-p", slash(PREFIX) + "/", "-c", "conf/nginx.conf", ...args], {
    cwd: isWindows ? dirname(NGINX) : PREFIX,
    encoding: "utf-8",
  });
}

/** 作業フォルダに、公開時と同じ設定と、ローカル用の nginx.conf を用意する */
function prepare() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.error("dist/ がありません。先に npm run build を実行してください");
    process.exit(1);
  }
  for (const d of ["conf", "logs", "temp"]) mkdirSync(join(PREFIX, d), { recursive: true });

  // 公開時と同じ設定（/etc/nginx/office-seat/ に置くもの）
  // （fs.cpSync はフォルダごとのコピーで Node.js が落ちることがあるので、1ファイルずつコピーする）
  const confDir = join(PREFIX, "conf", "office-seat");
  rmSync(confDir, { recursive: true, force: true });
  mkdirSync(confDir);
  const source = join(WEB_DIR, "deploy", "nginx", "office-seat");
  for (const name of readdirSync(source)) copyFileSync(join(source, name), join(confDir, name));

  // ファイルの種類の一覧は、nginx に付いてくるものを使う
  const mimeTypes = isWindows ? join(dirname(NGINX), "conf", "mime.types") : "/etc/nginx/mime.types";
  copyFileSync(mimeTypes, join(PREFIX, "conf", "mime.types"));

  // dist/ へのジャンクション（作り直すとビルドし直した内容もそのまま見える）
  const html = join(PREFIX, "html");
  rmSync(html, { recursive: true, force: true });
  symlinkSync(DIST, html, isWindows ? "junction" : "dir");

  writeFileSync(
    join(PREFIX, "conf", "nginx.conf"),
    `# npm run nginx:start が作るファイル（直接編集しない。元は my-app-web/scripts/nginx.mjs）
worker_processes 1;
error_log logs/error.log warn;
pid logs/nginx.pid;

events {
    worker_connections 256;
}

http {
    include mime.types;
    default_type application/octet-stream;
    sendfile on;
    access_log logs/access.log;

    client_body_temp_path temp/client_body;
    proxy_temp_path temp/proxy;
    fastcgi_temp_path temp/fastcgi;
    uwsgi_temp_path temp/uwsgi;
    scgi_temp_path temp/scgi;

    include office-seat/http.conf;

    # ローカル用（公開時は sites/office-seat.conf の HTTPS の server { } を使う）
    server {
        listen 127.0.0.1:${PORT};
        server_name localhost;
        root "${slash(html)}";
        include office-seat/app.conf;
    }
}
`,
  );
}

function check() {
  const res = run(["-t"]);
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
}

const isRunning = () => existsSync(join(PREFIX, "logs", "nginx.pid"));

const command = process.argv[2];
if (command === "start") {
  if (isRunning()) {
    console.log("nginx はもう起動しています（止めるときは npm run nginx:stop）");
    process.exit(0);
  }
  prepare();
  check();
  // nginx は起動したまま残る（このスクリプトは先に終わる）
  const child = spawn(NGINX, ["-p", slash(PREFIX) + "/", "-c", "conf/nginx.conf"], {
    cwd: isWindows ? dirname(NGINX) : PREFIX,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  console.log(`nginx を起動しました: http://127.0.0.1:${PORT}`);
  console.log("（API を http://127.0.0.1:8000 で起動しておく。止めるときは npm run nginx:stop）");
} else if (command === "stop") {
  if (!isRunning()) {
    console.log("nginx は起動していません");
    process.exit(0);
  }
  const res = run(["-s", "stop"]);
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
  console.log("nginx を止めました");
} else if (command === "reload") {
  prepare();
  check();
  const res = run(["-s", "reload"]);
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
  console.log("nginx の設定を読み込み直しました");
} else {
  console.error("使い方: node scripts/nginx.mjs start | stop | reload");
  process.exit(1);
}
