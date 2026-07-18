import { Router } from "express";
import { cleanChapterHtml } from "../clean.js";
import { fetchHtml, type CookieInput } from "../fetcher.js";
import { hamelnFetchOptions } from "../sites/hameln.js";
import { getAdapterByKey, resolveAdapterForUrl } from "../sites/index.js";
import type { NovelSiteAdapter } from "../sites/types.js";
import * as store from "../store.js";

export const novelsRouter = Router();

function fetchOptionsFor(adapter: NovelSiteAdapter): { cookies?: CookieInput[] } {
  return adapter.key === "hameln" ? hamelnFetchOptions() : {};
}

export async function registerNovel(novelId: string, adapter: NovelSiteAdapter): Promise<store.StoredNovel> {
  const options = fetchOptionsFor(adapter);
  const firstHtml = await fetchHtml(adapter.tocUrl(novelId, 1), options);
  const toc = adapter.parseToc(firstHtml);
  const chapters = [...toc.chapters];

  // Sites whose TOC is paginated (Narou: 100/page) need the remaining pages.
  const pageCount = adapter.parseTocPageCount(firstHtml);
  for (let page = 2; page <= pageCount; page++) {
    const html = await fetchHtml(adapter.tocUrl(novelId, page), options);
    chapters.push(...adapter.parseToc(html).chapters);
  }

  const novel: store.StoredNovel = {
    id: novelId,
    site: adapter.key,
    title: toc.title,
    author: toc.author,
    chapters,
  };
  await store.saveNovel(novel);
  return novel;
}

novelsRouter.post("/", async (req, res) => {
  const url = req.body?.url;
  if (typeof url !== "string" || !url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const adapter = resolveAdapterForUrl(url);
  if (!adapter) {
    res.status(400).json({ error: "unsupported site" });
    return;
  }

  try {
    const novelId = adapter.parseNovelId(url);
    const novel = await registerNovel(novelId, adapter);
    res.json({ id: novel.id, title: novel.title, author: novel.author, chapterCount: novel.chapters.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch or parse novel" });
  }
});

novelsRouter.get("/", async (_req, res, next) => {
  try {
    const novels = await store.listNovels();
    res.json(novels.map((n) => ({ id: n.id, title: n.title, author: n.author, chapterCount: n.chapters.length })));
  } catch (err) {
    next(err);
  }
});

novelsRouter.delete("/:id", async (req, res, next) => {
  if (!store.isSafeId(req.params.id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    await store.deleteNovel(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

novelsRouter.get("/:id", async (req, res, next) => {
  if (!store.isSafeId(req.params.id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  try {
    const novel = await store.loadNovel(req.params.id);
    if (!novel) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json({ id: novel.id, title: novel.title, author: novel.author, chapters: novel.chapters });
  } catch (err) {
    next(err);
  }
});

novelsRouter.get("/:id/chapters/:episode", async (req, res) => {
  const { id, episode } = req.params;
  if (!store.isSafeId(id) || !store.isSafeId(episode)) {
    res.status(400).json({ error: "invalid id or episode" });
    return;
  }

  try {
    // A cached entry with empty text is not a real cache hit - it means an
    // earlier fetch got a non-chapter page (most likely a Cloudflare
    // challenge page instead of the real one, since #honbun then does not
    // exist) and that failure got stored as if it had succeeded. Treat it
    // as a miss so it retries instead of being served forever.
    const cached = await store.loadChapter(id, episode);
    if (cached && cached.text.length > 0) {
      res.json(cached);
      return;
    }

    const novel = await store.loadNovel(id);
    if (!novel) {
      res.status(404).json({ error: "novel not found" });
      return;
    }
    const adapter = getAdapterByKey(novel.site);
    if (!adapter) {
      res.status(500).json({ error: "unknown site adapter" });
      return;
    }

    const html = await fetchHtml(adapter.chapterUrl(id, episode), fetchOptionsFor(adapter));
    const parsed = adapter.parseChapter(html);
    const text = cleanChapterHtml(parsed.bodyHtml);
    if (text.length === 0) {
      console.error(`empty chapter body for novel ${id} episode ${episode}, fetched html length ${html.length}`);
      res.status(502).json({ error: "fetched chapter appears empty, try again" });
      return;
    }
    const chapterMeta = novel.chapters.find((c) => c.episode === episode);
    const chapter: store.StoredChapter = { title: chapterMeta?.title ?? parsed.title, text };
    await store.saveChapter(id, episode, chapter);
    res.json(chapter);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch or parse chapter" });
  }
});
