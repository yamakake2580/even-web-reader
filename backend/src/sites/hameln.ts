import * as cheerio from "cheerio";
import { config } from "../config.js";
import type { CookieInput } from "../fetcher.js";
import type { ChapterMeta, ChapterResult, NovelSiteAdapter, TocResult } from "./types.js";

const HOST = "syosetu.org";

// Applied to every Hameln fetch (not just favorites), so requests look like
// the user's own logged-in session. NOTE: this does NOT unlock R18 works -
// those live on a separate subdomain (h.syosetu.org) behind their own
// age-confirmation gate, and fetching one anonymously returns an empty page
// (which is how novel 390328 got registered with a blank title). Supporting
// R18 content is a separate, larger piece of work; the empty-title guard on
// the client side keeps such a novel from breaking the whole list.
export function hamelnFetchOptions(): { cookies?: CookieInput[] } {
  return config.hamelnCookie ? { cookies: parseHamelnCookieString(config.hamelnCookie) } : {};
}

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

  // Hameln lists every chapter on a single TOC page.
  parseTocPageCount(): number {
    return 1;
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

export interface FavoriteNovel {
  id: string;
  title: string;
  author: string;
}

export interface FavoritesPage {
  novels: FavoriteNovel[];
  totalPages: number;
}

export function parseFavoritesPage(html: string): FavoritesPage {
  const $ = cheerio.load(html);

  const novels: FavoriteNovel[] = [];
  const seen = new Set<string>();
  $("h3").each((_, el) => {
    const link = $(el).find('a[href*="/novel/"]').first();
    const href = link.attr("href") ?? "";
    const match = href.match(/\/novel\/(\d+)\/$/);
    if (!match) return;
    const id = match[1];
    if (seen.has(id)) return;
    seen.add(id);

    const title = link.text().trim();
    // Author is usually its own link (/user/{id}/) but sometimes plain text
    // when the account has no public profile - fall back to the "作者：..." text.
    const authorLink = $(el).find('a[href*="/user/"]').first();
    const author = authorLink.length > 0 ? authorLink.text().trim() : ($(el).text().match(/作者：([^）]*)/)?.[1].trim() ?? "");

    novels.push({ id, title, author });
  });

  let totalPages = 1;
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/page=(\d+)/);
    if (match) totalPages = Math.max(totalPages, Number(match[1]));
  });

  return { novels, totalPages };
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
