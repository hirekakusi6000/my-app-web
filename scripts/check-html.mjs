// 画面の HTML を確認する：インラインのスクリプトや style 属性がないこと（CSP で禁止しているため）。
// 使い方: npm run check:html
import { readdirSync, readFileSync } from "node:fs";
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

const errors = [];
const pages = walk(root).filter((f) => f.endsWith(".html"));
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
console.log(`OK: HTML ${pages.length} 件`);
