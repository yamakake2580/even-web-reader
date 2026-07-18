import type { NovelSiteAdapter } from "./types.js";
import { hamelnAdapter } from "./hameln.js";
import { narouAdapter } from "./narou.js";
import { kakuyomuAdapter } from "./kakuyomu.js";

const adapters: NovelSiteAdapter[] = [hamelnAdapter, narouAdapter, kakuyomuAdapter];

export function resolveAdapterForUrl(url: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}

export function getAdapterByKey(key: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}
