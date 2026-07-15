import * as cheerio from "cheerio";

/**
 * Converts a chapter body's inner HTML (from NovelSiteAdapter#parseChapter)
 * into plain text with "\n\n"-delimited paragraphs, as expected by the G2
 * app's client-side paginator. Furigana is dropped (kept: base kanji only) -
 * the small monochrome display has no good way to render ruby, and Hameln's
 * furigana is usually stylistic rather than load-bearing for comprehension.
 */
export function cleanChapterHtml(bodyHtml: string): string {
  const $ = cheerio.load(`<div id="root">${bodyHtml}</div>`);
  $("ruby rt, ruby rp").remove();
  $("br").replaceWith("\n");

  const root = $("#root");
  const pTags = root.find("> p");

  const paragraphs =
    pTags.length > 0
      ? pTags.toArray().map((el) => paragraphText($(el).text()))
      : paragraphText(root.text())
          .split(/\n+/)
          .map((line) => paragraphText(line));

  return paragraphs.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function paragraphText(raw: string): string {
  const text = raw.replace(/\r\n|\r/g, "\n").trim();
  const isBlank = text.replace(/[　\s]/g, "") === "";
  return isBlank ? "" : text;
}
