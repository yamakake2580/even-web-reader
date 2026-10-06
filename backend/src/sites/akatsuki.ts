import * as cheerio from "cheerio";
import type { ChapterMeta, ChapterResult, NovelSiteAdapter, TocResult } from "./types.js";

// 暁 (akatsuki-novels.com). No Cloudflare - a plain fetch works. Story ids are
// non-sequential numbers and the author can reorder chapters, so reading order
// comes from the TOC's document order (never sorted). Long works paginate the
// TOC at 20 chapters/page (/stories/index/novel_id~X/page~N).
const HOST = "www.akatsuki-novels.com";

function extractNovelId(url: string): string {
  const match = url.match(/novel_id~(\d+)/) ?? url.match(/\/novels\/view\/(\d+)/);
  if (!match) throw new Error(`could not extract novel id from url: ${url}`);
  return match[1];
}

export const akatsukiAdapter: NovelSiteAdapter = {
  key: "akatsuki",

  matches(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return host === HOST || host === "akatsuki-novels.com";
    } catch {
      return false;
    }
  },

  parseNovelId(url: string): string {
    return extractNovelId(url);
  },

  tocUrl(novelId: string, page = 1): string {
    const base = `https://${HOST}/stories/index/novel_id~${novelId}`;
    return page > 1 ? `${base}/page~${page}` : base;
  },

  chapterUrl(novelId: string, episode: string): string {
    return `https://${HOST}/stories/view/${episode}/novel_id~${novelId}`;
  },

  parseToc(html: string): TocResult {
    const $ = cheerio.load(html);
    const title = $("#LookNovel").first().text().replace(/\s+/g, " ").trim();
    const author = $("h3")
      .filter((_, el) => $(el).text().includes("作者："))
      .first()
      .find("a")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const chapters: ChapterMeta[] = [];
    const seen = new Set<string>();
    $('table.list a[href^="/stories/view/"]').each((_, el) => {
      const match = ($(el).attr("href") ?? "").match(/^\/stories\/view\/(\d+)\//);
      if (!match || seen.has(match[1])) return;
      seen.add(match[1]);
      chapters.push({ episode: match[1], title: $(el).text().replace(/\s+/g, " ").trim() });
    });

    return { title, author, chapters };
  },

  parseTocPageCount(html: string): number {
    const $ = cheerio.load(html);
    let max = 1;
    $('a[href*="/page~"]').each((_, el) => {
      const match = ($(el).attr("href") ?? "").match(/\/page~(\d+)/);
      if (match) max = Math.max(max, Number(match[1]));
    });
    return max;
  },

  parseChapter(html: string): ChapterResult {
    const $ = cheerio.load(html);
    // A chapter page has up to three div.body-novel blocks: preface, main
    // text, afterword. The preface/afterword are each preceded by a label
    // div ("前書き" / "後書き"); the main text isn't.
    const blocks = $("div.body-novel");
    const main = blocks
      .filter((_, el) => {
        const label = $(el).prev().text().trim();
        return label !== "前書き" && label !== "後書き";
      })
      .first();
    const body = main.length > 0 ? main : blocks.first();

    return {
      title: $("div.story h2").first().text().replace(/\s+/g, " ").trim() || $("h2").first().text().trim(),
      bodyHtml: body.html() ?? "",
    };
  },
};
