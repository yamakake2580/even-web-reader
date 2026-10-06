import assert from "node:assert/strict";
import test from "node:test";
import { cleanChapterTitle } from "../src/sites/hameln.js";

test("cleanChapterTitle strips timestamps, (改) and lone marker lines", () => {
  assert.equal(cleanChapterTitle("一話  転入初日\n\t\t2017/03/13 20:36\n\t\t(改)"), "一話 転入初日");
  assert.equal(cleanChapterTitle("●\n\t\t二話  何者\n\t\t2017/03/27 13:10\n\t\t(改)"), "二話 何者");
  assert.equal(cleanChapterTitle("第一話"), "第一話");
});
