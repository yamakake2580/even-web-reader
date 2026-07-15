const DEFAULT_BACKEND_URL = 'http://localhost:8787'

// TODO(milestone 11): read/write this via bridge.getLocalStorage/setLocalStorage
// once the companion "backend URL" settings screen exists.
function getBackendUrl(): string {
  return DEFAULT_BACKEND_URL
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
