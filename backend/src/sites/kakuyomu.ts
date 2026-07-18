import * as cheerio from "cheerio";
import type { ChapterMeta, ChapterResult, NovelSiteAdapter, TocResult } from "./types.js";

// カクヨム (kakuyomu.jp). A Next.js site: no Cloudflare, but the chapter list
// isn't in the rendered HTML - it lives in the embedded __NEXT_DATA__ Apollo
// cache. Episode ids are opaque long numbers (not sequential), so the
// `episode` field carries the episode id and order comes from the work's
// tableOfContentsV2, never from sorting.
const HOST = "kakuyomu.jp";

interface ApolloRef {
  __ref: string;
}
type ApolloState = Record<string, Record<string, unknown>>;

function loadApollo(html: string): ApolloState {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) throw new Error("kakuyomu: __NEXT_DATA__ not found");
  const data = JSON.parse(raw);
  const state = data?.props?.pageProps?.__APOLLO_STATE__;
  if (!state) throw new Error("kakuyomu: apollo state not found");
  return state as ApolloState;
}

/** The page's main work object (the one ROOT_QUERY's work(...) points at). */
function mainWork(apollo: ApolloState): Record<string, unknown> {
  const root = apollo["ROOT_QUERY"] ?? {};
  const workEntry = Object.entries(root).find(([k]) => k.startsWith("work("));
  const ref = (workEntry?.[1] as ApolloRef | undefined)?.__ref;
  const work = ref ? apollo[ref] : undefined;
  if (!work) throw new Error("kakuyomu: main work not found");
  return work;
}

function extractWorkId(url: string): string {
  const match = url.match(/kakuyomu\.jp\/works\/(\d+)/);
  if (!match) throw new Error(`could not extract work id from url: ${url}`);
  return match[1];
}

export const kakuyomuAdapter: NovelSiteAdapter = {
  key: "kakuyomu",

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === HOST;
    } catch {
      return false;
    }
  },

  parseNovelId(url: string): string {
    return extractWorkId(url);
  },

  tocUrl(novelId: string): string {
    return `https://${HOST}/works/${novelId}`;
  },

  chapterUrl(novelId: string, episode: string): string {
    return `https://${HOST}/works/${novelId}/episodes/${episode}`;
  },

  parseToc(html: string): TocResult {
    const apollo = loadApollo(html);
    const work = mainWork(apollo);

    const title = String(work.title ?? "").trim();
    const authorRef = (work.author as ApolloRef | undefined)?.__ref;
    const author = authorRef ? String(apollo[authorRef]?.activityName ?? "").trim() : "";

    const chapters: ChapterMeta[] = [];
    for (const chapRef of (work.tableOfContentsV2 as ApolloRef[] | undefined) ?? []) {
      const chapter = apollo[chapRef.__ref];
      for (const epRef of (chapter?.episodeUnions as ApolloRef[] | undefined) ?? []) {
        if (!epRef.__ref.startsWith("Episode:")) continue;
        const ep = apollo[epRef.__ref];
        const id = String(ep?.id ?? epRef.__ref.slice("Episode:".length));
        chapters.push({ episode: id, title: String(ep?.title ?? "").trim() });
      }
    }

    return { title, author, chapters };
  },

  // The whole table of contents ships in one page's __NEXT_DATA__.
  parseTocPageCount(): number {
    return 1;
  },

  parseChapter(html: string): ChapterResult {
    const $ = cheerio.load(html);
    return {
      title: $(".widget-episodeTitle").first().text().trim(),
      bodyHtml: $(".widget-episodeBody.js-episode-body").first().html() ?? "",
    };
  },
};
