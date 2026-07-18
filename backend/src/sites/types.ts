export interface ChapterMeta {
  episode: string;
  title: string;
}

export interface TocResult {
  title: string;
  author: string;
  chapters: ChapterMeta[];
}

export interface ChapterResult {
  title: string;
  bodyHtml: string;
}

export interface NovelSiteAdapter {
  key: string;
  matches(url: string): boolean;
  parseNovelId(url: string): string;
  /** URL of a table-of-contents page. `page` (1-based) supports sites that
   *  split the chapter list across multiple pages (e.g. Narou, 100/page). */
  tocUrl(novelId: string, page?: number): string;
  chapterUrl(novelId: string, episode: string): string;
  /** Parses one TOC page: title/author (from page 1) and that page's chapters. */
  parseToc(html: string): TocResult;
  /** Total number of TOC pages, read from page 1's HTML. Single-page sites return 1. */
  parseTocPageCount(html: string): number;
  parseChapter(html: string): ChapterResult;
}
