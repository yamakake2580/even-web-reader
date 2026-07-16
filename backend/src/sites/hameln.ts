import * as cheerio from "cheerio";
import type { CookieInput } from "../fetcher.js";
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

// Favorites import: Hameln-specific, not part of the generic NovelSiteAdapter
// interface (favorites are a per-account feature, not a per-novel one).
// Requires a session cookie captured from the user's own real, manually
// logged-in browser (see config.hamelnCookie / README) - this project does
// not automate the Hameln login flow itself.

export function favoritesUrl(page: number): string {
  return `https://${HOST}/?mode=favo&page=${page}`;
}

export interface FavoritesPage {
  novelIds: string[];
  totalPages: number;
}

export function parseFavoritesPage(html: string): FavoritesPage {
  const $ = cheerio.load(html);

  const novelIds = new Set<string>();
  $('a[href*="/novel/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/\/novel\/(\d+)\/$/);
    if (match) novelIds.add(match[1]);
  });

  let totalPages = 1;
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/page=(\d+)/);
    if (match) totalPages = Math.max(totalPages, Number(match[1]));
  });

  return { novelIds: [...novelIds], totalPages };
}

/** Parses a "name=value; name=value" cookie header into fetchHtml's cookie format. */
export function parseHamelnCookieString(raw: string): CookieInput[] {
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      return { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim(), domain: `.${HOST}` };
    });
}
