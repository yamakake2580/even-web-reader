import { Router } from "express";
import { config } from "../config.js";
import { fetchHtml } from "../fetcher.js";
import { favoritesUrl, parseFavoritesPage, parseHamelnCookieString } from "../sites/hameln.js";

export const favoritesRouter = Router();

// One Hameln favorites page per request - lets the phone-side UI browse
// (and page through) the list without registering anything. The user picks
// which novels to actually add via the existing POST /novels, same as
// adding by URL. Requires HAMELN_COOKIE (see config.ts / README) - a
// session cookie the user copies from their own manually logged-in browser;
// this route never automates the Hameln login flow itself.
favoritesRouter.get("/", async (req, res) => {
  if (!config.hamelnCookie) {
    res.status(400).json({ error: "HAMELN_COOKIE is not configured" });
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const cookies = parseHamelnCookieString(config.hamelnCookie);

  try {
    const html = await fetchHtml(favoritesUrl(page), { cookies });
    const parsed = parseFavoritesPage(html);
    res.json({ page, totalPages: parsed.totalPages, novels: parsed.novels });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "failed to fetch favorites page" });
  }
});
