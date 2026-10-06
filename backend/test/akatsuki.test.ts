import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanChapterHtml } from "../src/clean.js";
import { akatsukiAdapter } from "../src/sites/akatsuki.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(path.join(dir, "fixtures", f), "utf8");

test("akatsuki matches its host and parses the novel id from several url shapes", () => {
  assert.equal(akatsukiAdapter.matches("https://www.akatsuki-novels.com/stories/index/novel_id~10044"), true);
  assert.equal(akatsukiAdapter.matches("https://kakuyomu.jp/works/1"), false);
  assert.equal(akatsukiAdapter.parseNovelId("https://www.akatsuki-novels.com/stories/index/novel_id~10044"), "10044");
  assert.equal(akatsukiAdapter.parseNovelId("https://www.akatsuki-novels.com/novels/view/10044"), "10044");
  assert.equal(akatsukiAdapter.parseNovelId("https://www.akatsuki-novels.com/stories/view/103900/novel_id~10044"), "10044");
  assert.equal(akatsukiAdapter.tocUrl("22249", 2), "https://www.akatsuki-novels.com/stories/index/novel_id~22249/page~2");
});

test("akatsuki parseToc reads title, author and chapters in TOC order", () => {
  const toc = akatsukiAdapter.parseToc(read("akatsuki-toc.html"));
  assert.ok(toc.title.includes("ボロディン"));
  assert.ok(toc.author.length > 0);
  assert.equal(toc.chapters.length, 138);
  assert.deepEqual(toc.chapters[0], { episode: "103900", title: "第１話 転生" });
  assert.equal(akatsukiAdapter.parseTocPageCount(read("akatsuki-toc.html")), 1);
});

test("akatsuki parseTocPageCount reads the pager on paginated works", () => {
  const html = read("akatsuki-toc-paged.html");
  assert.ok(akatsukiAdapter.parseTocPageCount(html) > 1);
  assert.equal(akatsukiAdapter.parseToc(html).chapters.length, 20);
});

test("akatsuki parseChapter picks the main text, not the preface/afterword", () => {
  const parsed = akatsukiAdapter.parseChapter(read("akatsuki-chapter.html"));
  const text = cleanChapterHtml(parsed.bodyHtml);
  assert.equal(parsed.title, "第１話 転生");
  assert.ok(text.startsWith("はたから見ればほんの一瞬の事だったんだろう。"));
  assert.ok(!text.includes("当サイトには初めての投稿"));
  assert.ok(text.includes("\n\n"));
});
