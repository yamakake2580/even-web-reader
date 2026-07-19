import { config } from "./config.js";
import { registerNovel } from "./routes/novels.js";
import { getAdapterByKey } from "./sites/index.js";
import * as store from "./store.js";

// Periodically re-fetch every registered novel's table of contents so
// chapterCount stays current for ongoing serials. registerNovel goes through
// the shared politeness-queued fetcher, so novels are refreshed one at a time
// regardless of how this is triggered.
export interface RefreshResult {
  checked: number;
  updated: number;
  failed: number;
}

export async function refreshAllNovels(): Promise<RefreshResult> {
  const novels = await store.listNovels();
  console.log(`refresh: checking ${novels.length} novels for updates`);
  let updated = 0;
  let failed = 0;
  for (const novel of novels) {
    const adapter = getAdapterByKey(novel.site);
    if (!adapter) continue;
    try {
      const before = novel.chapters.length;
      const after = await registerNovel(novel.id, adapter);
      if (after.chapters.length !== before) {
        updated++;
        console.log(`refresh: ${novel.id} "${after.title}" ${before} -> ${after.chapters.length} chapters`);
      }
    } catch (err) {
      failed++;
      console.error(`refresh: failed for novel ${novel.id}`, err);
    }
  }
  console.log(`refresh: done (${updated} updated, ${failed} failed)`);
  return { checked: novels.length, updated, failed };
}

export function startRefreshScheduler(): void {
  const hours = config.refreshIntervalHours;
  if (hours <= 0) {
    console.log("refresh: scheduler disabled (REFRESH_INTERVAL_HOURS=0)");
    return;
  }
  const intervalMs = hours * 60 * 60 * 1000;
  // Run once shortly after startup, then on the interval.
  setTimeout(() => void refreshAllNovels().catch((err) => console.error(err)), 30_000);
  setInterval(() => void refreshAllNovels().catch((err) => console.error(err)), intervalMs);
  console.log(`refresh: scheduler started (every ${hours}h)`);
}
