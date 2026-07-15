import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanChapterHtml } from "../src/clean.js";
import { hamelnAdapter } from "../src/sites/hameln.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const tocHtml = readFileSync(path.join(dir, "fixtures/hameln-toc.html"), "utf8");
const chapterHtml = readFileSync(path.join(dir, "fixtures/hameln-chapter.html"), "utf8");

test("parseToc extracts title, author, and chapter list", () => {
  const toc = hamelnAdapter.parseToc(tocHtml);
  assert.equal(toc.title, "魔法少女まどか☆マギカ★マジか？");
  assert.equal(toc.author, "深冬");
  assert.equal(toc.chapters.length, 16);
  assert.deepEqual(toc.chapters[0], { episode: "1", title: "プロローグ" });
  assert.deepEqual(toc.chapters[15], { episode: "16", title: "また違う未来" });
});

test("parseChapter + cleanChapterHtml produce paragraph-delimited plain text", () => {
  const parsed = hamelnAdapter.parseChapter(chapterHtml);
  const text = cleanChapterHtml(parsed.bodyHtml);
  assert.ok(text.startsWith("その日、俺を取り巻く世界は終焉を迎えた。"));
  assert.ok(text.includes("\n\n"));
  assert.ok(!text.includes("<p"));
  assert.ok(!text.includes("<ruby"));
});
