import * as cheerio from "cheerio";
import type { ChapterMeta, ChapterResult, NovelSiteAdapter, TocResult } from "./types.js";

// 小説家になろう (ncode.syosetu.com). Unlike Hameln, there is no Cloudflare
// challenge - a plain fetch works - but the table of contents is paginated
// at 100 chapters per page (?p=N).
const HOST = "ncode.syosetu.com";

function extractNcode(url: string): string {
  const match = url.match(/ncode\.syosetu\.com\/(n[0-9a-z]+)/i);
  if (!match) {
    throw new Error(`could not extract ncode from url: ${url}`);
  }
  return match[1].toLowerCase();
}

export const narouAdapter: NovelSiteAdapter = {
  key: "narou",

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === HOST;
    } catch {
      return false;
    }
  },

  parseNovelId(url: string): string {
    return extractNcode(url);
  },

  tocUrl(novelId: string, page = 1): string {
    return page > 1 ? `https://${HOST}/${novelId}/?p=${page}` : `https://${HOST}/${novelId}/`;
  },

  chapterUrl(novelId: string, episode: string): string {
    return `https://${HOST}/${novelId}/${episode}/`;
  },

  parseToc(html: string): TocResult {
    const $ = cheerio.load(html);
    const title = $(".p-novel__title").first().text().trim();
    const author = $(".p-novel__author").first().text().replace(/^作者：/, "").trim();

    const chapters: ChapterMeta[] = [];
    $("a.p-eplist__subtitle").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/\/(\d+)\/$/);
      if (!match) return;
      chapters.push({ episode: match[1], title: $(el).text().trim() });
    });

    return { title, author, chapters };
  },

  parseTocPageCount(html: string): number {
    const $ = cheerio.load(html);
    let max = 1;
    $('a[href*="?p="]').each((_, el) => {
      const match = ($(el).attr("href") ?? "").match(/[?&]p=(\d+)/);
      if (match) max = Math.max(max, Number(match[1]));
    });
    return max;
  },

  parseChapter(html: string): ChapterResult {
    const $ = cheerio.load(html);
    // The main body carries no preface/afterword modifier class.
    const body = $(".p-novel__body .js-novel-text.p-novel__text")
      .filter((_, el) => {
        const cls = $(el).attr("class") ?? "";
        return !cls.includes("--preface") && !cls.includes("--afterword");
      })
      .first();

    return {
      title: $(".p-novel__title").first().text().trim(),
      bodyHtml: body.html() ?? "",
    };
  },
};
