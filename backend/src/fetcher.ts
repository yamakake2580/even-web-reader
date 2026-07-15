import { chromium, type Browser, type Page } from "playwright";
import { config } from "./config.js";

// syosetu.org puts chapter pages (though not table-of-contents pages) behind a
// Cloudflare managed challenge. A plain HTTP client never passes it; a real
// browser engine does, automatically, within a couple of seconds.
//
// Originally this reused one browser context (and its cf_clearance cookie)
// for the whole process lifetime, on the assumption that would be both
// faster and less suspicious-looking than repeatedly re-solving the
// challenge. In practice the opposite happened: many sequential requests
// through the same long-lived context/cookie started getting re-challenged
// and the challenge would not clear even after 15s of polling, while a
// throwaway fresh context succeeded immediately for the exact same URLs
// (verified directly against several real chapters that were failing).
// So: one browser process stays alive (launching Chromium per request would
// be much slower), but every fetch gets its own fresh context and cookie jar.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + config.hamelnMinIntervalMs - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

// "domcontentloaded" fires for the Cloudflare interstitial itself (a small,
// fully-loaded page) well before its background JS finishes the challenge
// and swaps in the real page. Reading page.content() at that point silently
// captures the empty interstitial instead of the chapter - this is what was
// producing empty (but "successfully" cached) chapters. Poll the title until
// it stops looking like a challenge page before reading content.
async function waitForCloudflareChallenge(page: Page): Promise<void> {
  const looksLikeChallenge = async () => (await page.title().catch(() => "")).includes("Just a moment");
  if (!(await looksLikeChallenge())) return;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    if (!(await looksLikeChallenge())) return;
  }
}

/** Fetches a page's rendered HTML, serialized behind a politeness queue. */
export function fetchHtml(url: string): Promise<string> {
  const result = queue.then(async () => {
    await throttle();
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: "ja-JP" });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitForCloudflareChallenge(page);
      return await page.content();
    } finally {
      await context.close();
    }
  });
  // Keep the queue alive even if this request fails, so later requests still run.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function shutdownFetcher(): Promise<void> {
  if (browserPromise) {
    await (await browserPromise).close();
  }
}
