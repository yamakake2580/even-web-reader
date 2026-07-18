import { cacheJson, deleteOfflineNovel, getOfflineChapters, getStorage, readCachedJson, removeKey } from './storage'

const DEFAULT_BACKEND_URL = 'http://localhost:8787'

function getBackendUrl(): string {
  return getStorage('backend_url') || DEFAULT_BACKEND_URL
}

// When the backend host is unreachable (e.g. the machine running it is asleep
// or off), a plain fetch doesn't fail fast - it hangs until the OS connection
// timeout (tens of seconds), which made downloaded novels seem not to open
// while they were really just waiting on that hang before falling back to the
// offline cache. A short AbortController timeout makes metadata reads give up
// quickly so the offline fallback kicks in almost immediately. Chapter body
// fetches keep no timeout (a real scrape can legitimately take several
// seconds), and reading a downloaded chapter is offline-first anyway.
async function getJson<T>(path: string, timeoutMs?: number): Promise<T> {
  const controller = new AbortController()
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetch(`${getBackendUrl()}${path}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
    return (await res.json()) as T
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const METADATA_TIMEOUT_MS = 4000

export interface ChapterMeta {
  episode: string
  title: string
}

export interface NovelSummary {
  id: string
  title: string
  author: string
  chapterCount: number
}

export interface NovelDetail {
  id: string
  title: string
  author: string
  chapters: ChapterMeta[]
}

export interface ChapterContent {
  title: string
  text: string
}

// Offline fallback: cache metadata on every successful fetch and serve the
// cache when the backend is unreachable, so the bookshelf and chapter list
// (and thus reaching already-downloaded chapters) work fully offline.
const NOVELS_CACHE_KEY = 'novels_cache'
const novelDetailKey = (id: string) => `novel_detail:${id}`

export async function fetchNovels(): Promise<NovelSummary[]> {
  try {
    const novels = await getJson<NovelSummary[]>('/novels', METADATA_TIMEOUT_MS)
    await cacheJson(NOVELS_CACHE_KEY, novels)
    return novels
  } catch (err) {
    const cached = await readCachedJson<NovelSummary[]>(NOVELS_CACHE_KEY)
    if (cached) return cached
    throw err
  }
}

export async function fetchNovel(novelId: string): Promise<NovelDetail> {
  try {
    const detail = await getJson<NovelDetail>(`/novels/${encodeURIComponent(novelId)}`, METADATA_TIMEOUT_MS)
    await cacheJson(novelDetailKey(novelId), detail)
    return detail
  } catch (err) {
    // Prefer the full cached metadata (includes not-yet-downloaded chapters)...
    const cached = await readCachedJson<NovelDetail>(novelDetailKey(novelId))
    if (cached) return cached
    // ...otherwise rebuild the list from downloaded chapters, so a novel whose
    // metadata was never cached but whose chapters are saved still opens.
    const offlineChapters = await getOfflineChapters(novelId)
    if (offlineChapters.length > 0) {
      const summary = (await readCachedJson<NovelSummary[]>(NOVELS_CACHE_KEY))?.find((n) => n.id === novelId)
      return { id: novelId, title: summary?.title ?? novelId, author: summary?.author ?? '', chapters: offlineChapters }
    }
    throw err
  }
}

export function fetchChapter(novelId: string, episode: string): Promise<ChapterContent> {
  return getJson(`/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(episode)}`)
}

export async function registerNovel(url: string): Promise<NovelSummary> {
  const res = await fetch(`${getBackendUrl()}/novels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(`POST /novels failed: ${res.status}`)
  return res.json()
}

/**
 * Removes a novel from the bookshelf: deletes it on the backend, then clears
 * every local trace (downloaded chapters, cached chapter list, and the entry
 * in the cached bookshelf) so it won't reappear from the offline cache.
 */
export async function deleteNovel(novelId: string): Promise<void> {
  const res = await fetch(`${getBackendUrl()}/novels/${encodeURIComponent(novelId)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE /novels failed: ${res.status}`)
  await deleteOfflineNovel(novelId)
  await removeKey(novelDetailKey(novelId))
  const cached = await readCachedJson<NovelSummary[]>(NOVELS_CACHE_KEY)
  if (cached) await cacheJson(NOVELS_CACHE_KEY, cached.filter((n) => n.id !== novelId))
}

export interface FavoriteNovel {
  id: string
  title: string
  author: string
}

export interface FavoritesPage {
  page: number
  totalPages: number
  novels: FavoriteNovel[]
}

export function fetchFavoritesPage(page: number): Promise<FavoritesPage> {
  return getJson(`/favorites?page=${page}`)
}
