import { Router } from "express";
import { cleanChapterHtml } from "../clean.js";
import { config } from "../config.js";
import { fetchHtml } from "../fetcher.js";
import { hamelnAdapter, favoritesUrl, parseFavoritesPage, parseHamelnCookieString } from "../sites/hameln.js";
import { getAdapterByKey, resolveAdapterForUrl } from "../sites/index.js";
import type { NovelSiteAdapter } from "../sites/types.js";
import * as store from "../store.js";

export const novelsRouter = Router();

async function registerNovel(novelId: string, adapter: NovelSiteAdapter): Promise<store.StoredNovel> {
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

// Imports every novel in the users Hameln favorites list as a bookshelf
// entry (metadata + chapter list only - no chapter text is fetched here).
// Reading still goes through the normal on-demand chapter endpoint, so this
// stays as light as adding each novel by URL individually would be, just
// automated across however many favorites pages exist. Requires
// HAMELN_COOKIE (see config.ts / README) - a session cookie the user copies
// from their own manually logged-in browser. This route never automates the
// Hameln login flow itself.
novelsRouter.post("/import-favorites", async (_req, res) => {
  if (!config.hamelnCookie) {
    res.status(400).json({ error: "HAMELN_COOKIE is not configured" });
    return;
  }
  const cookies = parseHamelnCookieString(config.hamelnCookie);

  try {
    const novelIds = new Set<string>();
    const first = parseFavoritesPage(await fetchHtml(favoritesUrl(1), { cookies }));
    first.novelIds.forEach((id) => novelIds.add(id));
    console.log(`favorites import: fetched page 1/${first.totalPages} (${novelIds.size} novels so far)`);

    for (let page = 2; page <= first.totalPages; page++) {
      const parsed = parseFavoritesPage(await fetchHtml(favoritesUrl(page), { cookies }));
      parsed.novelIds.forEach((id) => novelIds.add(id));
      console.log(`favorites import: fetched page ${page}/${first.totalPages} (${novelIds.size} novels so far)`);
    }

    let registered = 0;
    let failed = 0;
    let done = 0;
    for (const novelId of novelIds) {
      done++;
      try {
        await registerNovel(novelId, hamelnAdapter);
        registered++;
      } catch (err) {
        console.error(`favorites import: failed to register novel ${novelId}`, err);
        failed++;
      }
      console.log(`favorites import: registered ${done}/${novelIds.size} (novel ${novelId})`);
    }

    res.json({ totalFavorites: novelIds.size, registered, failed });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch favorites list" });
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

    const html = await fetchHtml(adapter.chapterUrl(id, episode));
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
