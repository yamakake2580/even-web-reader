import { Router } from "express";
import { cleanChapterHtml } from "../clean.js";
import { fetchHtml } from "../fetcher.js";
import { getAdapterByKey, resolveAdapterForUrl } from "../sites/index.js";
import * as store from "../store.js";

export const novelsRouter = Router();

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
    const html = await fetchHtml(adapter.tocUrl(novelId));
    const toc = adapter.parseToc(html);
    const novel: store.StoredNovel = {
      id: novelId,
      site: adapter.key,
      title: toc.title,
      author: toc.author,
      chapters: toc.chapters,
    };
    await store.saveNovel(novel);
    res.json({ id: novel.id, title: novel.title, author: novel.author, chapterCount: novel.chapters.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch or parse novel" });
  }
});

novelsRouter.get("/", async (_req, res) => {
  const novels = await store.listNovels();
  res.json(novels.map((n) => ({ id: n.id, title: n.title, author: n.author, chapterCount: n.chapters.length })));
});

novelsRouter.get("/:id", async (req, res) => {
  const novel = await store.loadNovel(req.params.id);
  if (!novel) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ id: novel.id, title: novel.title, author: novel.author, chapters: novel.chapters });
});

novelsRouter.get("/:id/chapters/:episode", async (req, res) => {
  const { id, episode } = req.params;

  const cached = await store.loadChapter(id, episode);
  if (cached) {
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

  try {
    const html = await fetchHtml(adapter.chapterUrl(id, episode));
    const parsed = adapter.parseChapter(html);
    const text = cleanChapterHtml(parsed.bodyHtml);
    const chapterMeta = novel.chapters.find((c) => c.episode === episode);
    const chapter: store.StoredChapter = { title: chapterMeta?.title ?? parsed.title, text };
    await store.saveChapter(id, episode, chapter);
    res.json(chapter);
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch or parse chapter" });
  }
});
