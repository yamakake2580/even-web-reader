import { cacheJson, getStorage, readCachedJson } from './storage'

const DEFAULT_BACKEND_URL = 'http://localhost:8787'

function getBackendUrl(): string {
  return getStorage('backend_url') || DEFAULT_BACKEND_URL
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getBackendUrl()}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

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
    const novels = await getJson<NovelSummary[]>('/novels')
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
    const detail = await getJson<NovelDetail>(`/novels/${encodeURIComponent(novelId)}`)
    await cacheJson(novelDetailKey(novelId), detail)
    return detail
  } catch (err) {
    const cached = await readCachedJson<NovelDetail>(novelDetailKey(novelId))
    if (cached) return cached
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
