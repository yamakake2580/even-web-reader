import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

// bridge.getLocalStorage/setLocalStorage is the only storage that survives a
// glasses/app restart - plain browser localStorage gets wiped. There is no
// "list all keys" call, so we eagerly load a fixed set of known keys once at
// startup into an in-memory cache: reads are then synchronous, writes are
// write-through (cache updated immediately, persisted async).
const KNOWN_KEYS = ['backend_url', 'reading_position'] as const
export type StorageKey = (typeof KNOWN_KEYS)[number]

const cache = new Map<string, string>()
let bridgeRef: EvenAppBridge | null = null

export async function initStorage(bridge: EvenAppBridge): Promise<void> {
  bridgeRef = bridge
  await Promise.all(
    KNOWN_KEYS.map(async (key) => {
      try {
        const value = await bridge.getLocalStorage(key)
        if (value) cache.set(key, value)
      } catch (err) {
        console.error(`getLocalStorage(${key}) failed:`, err)
      }
    }),
  )
}

export function getStorage(key: StorageKey): string | undefined {
  return cache.get(key)
}

export function setStorage(key: StorageKey, value: string): void {
  cache.set(key, value)
  bridgeRef?.setLocalStorage(key, value).catch((err) => console.error(`setLocalStorage(${key}) failed:`, err))
}

export interface ReadingPosition {
  novelId: string
  episode: string
  pageIndex: number
}

export function getReadingPosition(): ReadingPosition | null {
  const raw = getStorage('reading_position')
  if (!raw) return null
  try {
    return JSON.parse(raw) as ReadingPosition
  } catch {
    return null
  }
}

export function setReadingPosition(position: ReadingPosition): void {
  setStorage('reading_position', JSON.stringify(position))
}

// Offline chapter storage. Unlike backend_url/reading_position (a small,
// fixed, always-needed set of keys preloaded at startup), chapters are
// numerous, can be large, and are only needed on demand - so these talk to
// the bridge directly per call instead of going through the in-memory cache.
// There is no "list keys" call on the bridge, so a small JSON index array
// (one key per novel) tracks which episodes have been saved, so we can
// answer "is chapter N downloaded?" without probing every possible key.
export interface OfflineChapter {
  title: string
  text: string
}

function chapterKey(novelId: string, episode: string): string {
  return `chapter:${novelId}:${episode}`
}

function chapterIndexKey(novelId: string): string {
  return `chapter_index:${novelId}`
}

async function getChapterIndex(novelId: string): Promise<string[]> {
  if (!bridgeRef) return []
  try {
    const raw = await bridgeRef.getLocalStorage(chapterIndexKey(novelId))
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export async function getOfflineChapter(novelId: string, episode: string): Promise<OfflineChapter | null> {
  if (!bridgeRef) return null
  try {
    const raw = await bridgeRef.getLocalStorage(chapterKey(novelId, episode))
    return raw ? (JSON.parse(raw) as OfflineChapter) : null
  } catch {
    return null
  }
}

/** Best-effort: returns false (does not throw) if saving fails, e.g. storage full. */
export async function saveOfflineChapter(novelId: string, episode: string, chapter: OfflineChapter): Promise<boolean> {
  if (!bridgeRef) return false
  try {
    await bridgeRef.setLocalStorage(chapterKey(novelId, episode), JSON.stringify(chapter))
    const index = await getChapterIndex(novelId)
    if (!index.includes(episode)) {
      await bridgeRef.setLocalStorage(chapterIndexKey(novelId), JSON.stringify([...index, episode]))
    }
    return true
  } catch (err) {
    console.error(`saveOfflineChapter(${novelId}, ${episode}) failed:`, err)
    return false
  }
}

export async function isChapterSavedOffline(novelId: string, episode: string): Promise<boolean> {
  const index = await getChapterIndex(novelId)
  return index.includes(episode)
}

/** How many chapters of a novel are saved offline (for the bookshelf's fully-downloaded mark). */
export async function getOfflineChapterCount(novelId: string): Promise<number> {
  const index = await getChapterIndex(novelId)
  return index.length
}

// Metadata cache (novel list + per-novel chapter lists), so the bookshelf and
// chapter list can still be shown when the backend is unreachable - letting
// already-downloaded chapters be reached and read fully offline. Written
// whenever a fetch succeeds; read as a fallback when a fetch fails.
export async function cacheJson(key: string, value: unknown): Promise<void> {
  if (!bridgeRef) return
  try {
    await bridgeRef.setLocalStorage(key, JSON.stringify(value))
  } catch (err) {
    console.error(`cacheJson(${key}) failed:`, err)
  }
}

export async function readCachedJson<T>(key: string): Promise<T | null> {
  if (!bridgeRef) return null
  try {
    const raw = await bridgeRef.getLocalStorage(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
