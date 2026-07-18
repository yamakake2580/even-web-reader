import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanChapterHtml } from "../src/clean.js";
import { narouAdapter } from "../src/sites/narou.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const tocHtml = readFileSync(path.join(dir, "fixtures/narou-toc.html"), "utf8");
const chapterHtml = readFileSync(path.join(dir, "fixtures/narou-chapter.html"), "utf8");

test("narou matches ncode.syosetu.com and parses the ncode", () => {
  assert.equal(narouAdapter.matches("https://ncode.syosetu.com/n9669bk/"), true);
  assert.equal(narouAdapter.matches("https://syosetu.org/novel/1/"), false);
  assert.equal(narouAdapter.parseNovelId("https://ncode.syosetu.com/n9669bk/5/"), "n9669bk");
});

test("narou tocUrl paginates with ?p=", () => {
  assert.equal(narouAdapter.tocUrl("n9669bk"), "https://ncode.syosetu.com/n9669bk/");
  assert.equal(narouAdapter.tocUrl("n9669bk", 2), "https://ncode.syosetu.com/n9669bk/?p=2");
});

test("narou parseToc extracts title, author, and a page of chapters", () => {
  const toc = narouAdapter.parseToc(tocHtml);
  assert.ok(toc.title.includes("無職転生"));
  assert.ok(toc.author.length > 0);
  assert.equal(toc.chapters.length, 100); // 100 per TOC page
  assert.deepEqual(toc.chapters[0], { episode: "1", title: "プロローグ" });
});

test("narou parseTocPageCount reads the pager (multi-page TOC)", () => {
  assert.ok(narouAdapter.parseTocPageCount(tocHtml) >= 3);
});

test("narou parseChapter + cleanChapterHtml produce paragraph plain text", () => {
  const parsed = narouAdapter.parseChapter(chapterHtml);
  const textOut = cleanChapterHtml(parsed.bodyHtml);
  assert.ok(parsed.title.length > 0);
  assert.ok(textOut.startsWith("俺は34歳住所不定無職。"));
  assert.ok(textOut.includes("\n\n"));
  assert.ok(!textOut.includes("<p"));
});
