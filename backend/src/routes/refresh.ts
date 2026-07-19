import { Router } from "express";
import { refreshAllNovels } from "../refresh.js";

export const refreshRouter = Router();

// Manual "check all novels for new chapters now" trigger. A full run does one
// TOC fetch per novel (minutes for a large bookshelf), far longer than an
// HTTP request should stay open, so it's fire-and-forget: kick off the job and
// return immediately. Results show up in the bookshelf's ★ marks afterward.
let refreshInProgress = false;

refreshRouter.post("/", (_req, res) => {
  if (refreshInProgress) {
    res.json({ started: false, reason: "already running" });
    return;
  }
  refreshInProgress = true;
  void refreshAllNovels()
    .catch((err) => console.error(err))
    .finally(() => {
      refreshInProgress = false;
    });
  res.json({ started: true });
});
