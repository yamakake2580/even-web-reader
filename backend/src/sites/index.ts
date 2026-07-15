import type { NovelSiteAdapter } from "./types.js";
import { hamelnAdapter } from "./hameln.js";

const adapters: NovelSiteAdapter[] = [hamelnAdapter];

export function resolveAdapterForUrl(url: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}

export function getAdapterByKey(key: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}
