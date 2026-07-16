import { getStorage } from './storage'

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

export function fetchNovels(): Promise<NovelSummary[]> {
  return getJson('/novels')
}

export function fetchNovel(novelId: string): Promise<NovelDetail> {
  return getJson(`/novels/${encodeURIComponent(novelId)}`)
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

export interface ImportFavoritesResult {
  totalFavorites: number
  registered: number
  failed: number
}

// Can take a long time (one request per favorites page, plus one per novel) -
// callers should show an indeterminate "in progress" state, not a spinner
// with a timeout.
export async function importFavorites(): Promise<ImportFavoritesResult> {
  const res = await fetch(`${getBackendUrl()}/novels/import-favorites`, { method: 'POST' })
  if (!res.ok) throw new Error(`POST /novels/import-favorites failed: ${res.status}`)
  return res.json()
}
