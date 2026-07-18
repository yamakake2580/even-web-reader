import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanChapterHtml } from "../src/clean.js";
import { kakuyomuAdapter } from "../src/sites/kakuyomu.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const workHtml = readFileSync(path.join(dir, "fixtures/kakuyomu-work.html"), "utf8");
const episodeHtml = readFileSync(path.join(dir, "fixtures/kakuyomu-episode.html"), "utf8");

test("kakuyomu matches its host and parses work/episode ids from urls", () => {
  assert.equal(kakuyomuAdapter.matches("https://kakuyomu.jp/works/16816927859675616240"), true);
  assert.equal(kakuyomuAdapter.matches("https://ncode.syosetu.com/n9669bk/"), false);
  assert.equal(
    kakuyomuAdapter.parseNovelId("https://kakuyomu.jp/works/16816927859675616240/episodes/123"),
    "16816927859675616240",
  );
  assert.equal(
    kakuyomuAdapter.chapterUrl("16816927859675616240", "16816927859675631302"),
    "https://kakuyomu.jp/works/16816927859675616240/episodes/16816927859675631302",
  );
});

test("kakuyomu parseToc reads title/author and the ordered episode list from __NEXT_DATA__", () => {
  const toc = kakuyomuAdapter.parseToc(workHtml);
  assert.ok(toc.title.length > 0);
  assert.equal(toc.author, "風楼");
  // First episode must be first in reading order (opaque id, not sorted).
  assert.equal(toc.chapters[0].episode, "16816927859675631302");
  assert.ok(toc.chapters[0].title.includes("第1話"));
  assert.ok(toc.chapters.length >= 200); // this work has 215 public episodes
});

test("kakuyomu parseChapter + cleanChapterHtml produce paragraph plain text", () => {
  const parsed = kakuyomuAdapter.parseChapter(episodeHtml);
  const textOut = cleanChapterHtml(parsed.bodyHtml);
  assert.ok(textOut.startsWith("人の役に立つ仕事をするように。"));
  assert.ok(textOut.includes("\n\n"));
  assert.ok(!textOut.includes("<p"));
});
