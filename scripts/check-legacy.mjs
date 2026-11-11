// まだ Vue に移行していない画面（legacy/）と、画面の HTML を確認する。
//   - JavaScript に文法エラーがないこと（node --check。実行はしない）
//   - HTML にインラインのスクリプトや style 属性がないこと（CSP で禁止しているため）
// 使い方: npm run check:legacy
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const IGNORE = new Set(["node_modules", "dist", "test-results", "playwright-report", ".git"]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORE.has(e.name)) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(root);
const errors = [];

// 画面のスクリプトは ES モジュールなので、拡張子 .mjs の一時ファイルにコピーしてから確認する
const tmp = mkdtempSync(join(tmpdir(), "check-legacy-"));
const scripts = files.filter((f) => f.startsWith(join(root, "legacy")) && f.endsWith(".js"));
for (const script of scripts) {
  const copy = join(tmp, "check.mjs");
  copyFileSync(script, copy);
  const res = spawnSync(process.execPath, ["--check", copy], { encoding: "utf-8" });
  if (res.status !== 0) errors.push(`${relative(root, script)}\n${res.stderr}`);
}
rmSync(tmp, { recursive: true, force: true });

const pages = files.filter((f) => f.endsWith(".html"));
for (const page of pages) {
  const text = readFileSync(page, "utf-8");
  for (const tag of text.split("<script").slice(1)) {
    if (!tag.split(">")[0].includes("src=")) errors.push(`${relative(root, page)}: インラインスクリプトがあります`);
  }
  if (text.includes(' style="')) errors.push(`${relative(root, page)}: style 属性があります`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: スクリプト ${scripts.length} 件、HTML ${pages.length} 件`);
