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
  tocUrl(novelId: string): string;
  chapterUrl(novelId: string, episode: string): string;
  parseToc(html: string): TocResult;
  parseChapter(html: string): ChapterResult;
}
