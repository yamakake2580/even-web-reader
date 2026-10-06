import type { NovelSiteAdapter } from "./types.js";
import { hamelnAdapter } from "./hameln.js";
import { narouAdapter } from "./narou.js";
import { kakuyomuAdapter } from "./kakuyomu.js";
import { akatsukiAdapter } from "./akatsuki.js";

const adapters: NovelSiteAdapter[] = [hamelnAdapter, narouAdapter, kakuyomuAdapter, akatsukiAdapter];

export function resolveAdapterForUrl(url: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}

export function getAdapterByKey(key: string): NovelSiteAdapter | null {
  return adapters.find((adapter) => adapter.key === key) ?? null;
}
