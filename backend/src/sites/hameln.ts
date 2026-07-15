import * as cheerio from "cheerio";
import type { ChapterMeta, ChapterResult, NovelSiteAdapter, TocResult } from "./types.js";

const HOST = "syosetu.org";

function extractNovelId(url: string): string {
  const match = url.match(/\/novel\/(\d+)\//);
  if (!match) {
    throw new Error(`could not extract novel id from url: ${url}`);
  }
  return match[1];
}

export const hamelnAdapter: NovelSiteAdapter = {
  key: "hameln",

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === HOST;
    } catch {
      return false;
    }
  },

  parseNovelId(url: string): string {
    return extractNovelId(url);
  },

  tocUrl(novelId: string): string {
    return `https://${HOST}/novel/${novelId}/`;
  },

  chapterUrl(novelId: string, episode: string): string {
    return `https://${HOST}/novel/${novelId}/${episode}.html`;
  },

  parseToc(html: string): TocResult {
    const $ = cheerio.load(html);
    const title = $('span[itemprop="name"]').first().text().trim();
    const author = $('span[itemprop="author"] a').first().text().trim();

    const chapters: ChapterMeta[] = [];
    $('a[href$=".html"]').each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const match = href.match(/^\.\/(\d+)\.html$/);
      if (!match) return;
      chapters.push({ episode: match[1], title: $(el).text().trim() });
    });
    chapters.sort((a, b) => Number(a.episode) - Number(b.episode));

    return { title, author, chapters };
  },

  parseChapter(html: string): ChapterResult {
    const $ = cheerio.load(html);
    const titleSpan = $('span[style="font-size:120%"]')
      .filter((_, el) => $(el).find("a").length === 0)
      .first();

    return {
      title: titleSpan.text().trim(),
      bodyHtml: $("#honbun").html() ?? "",
    };
  },
};
