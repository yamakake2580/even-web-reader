import { chromium, type Browser, type BrowserContext } from "playwright";
import { config } from "./config.js";

// syosetu.org puts chapter pages (though not table-of-contents pages) behind a
// Cloudflare managed challenge. A plain HTTP client never passes it; a real
// browser engine does, automatically, within a couple of seconds. We keep one
// headless Chromium context alive for the process lifetime so the Cloudflare
// clearance cookie is reused across requests instead of re-solved every time.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let browserPromise: Promise<Browser> | null = null;
let contextPromise: Promise<BrowserContext> | null = null;
let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

async function getContext(): Promise<BrowserContext> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  const browser = await browserPromise;
  if (!contextPromise) {
    contextPromise = browser.newContext({ userAgent: USER_AGENT, locale: "ja-JP" });
  }
  return contextPromise;
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + config.hamelnMinIntervalMs - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

/** Fetches a page's rendered HTML, serialized behind a politeness queue. */
export function fetchHtml(url: string): Promise<string> {
  const result = queue.then(async () => {
    await throttle();
    const context = await getContext();
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return await page.content();
    } finally {
      await page.close();
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
  if (contextPromise) {
    await (await contextPromise).close();
  }
  if (browserPromise) {
    await (await browserPromise).close();
  }
}
