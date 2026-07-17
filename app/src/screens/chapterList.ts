import { fetchNovel, type ChapterMeta } from '../api'
import { createMenuState, menuSpec, type MenuState } from './menu'
import { isChapterSavedOffline } from '../storage'
import { nonEmptyLabel } from './util'
import type { PageSpec } from './types'

// Chapters saved for offline reading get this marker so it is visible on the
// glasses which ones do not need the backend to open.
export const DOWNLOADED_MARKER = '✓ '

export interface ChapterListState {
  novelId: string
  novelTitle: string
  chapters: ChapterMeta[]
  downloadedEpisodes: Set<string>
  menu: MenuState<ChapterMeta>
}

export async function loadChapterList(
  novelId: string,
  lastReadEpisode?: string,
): Promise<{ state: ChapterListState; spec: PageSpec }> {
  const novel = await fetchNovel(novelId)
  const downloaded = await Promise.all(novel.chapters.map((c) => isChapterSavedOffline(novelId, c.episode)))
  const downloadedEpisodes = new Set(novel.chapters.filter((_, i) => downloaded[i]).map((c) => c.episode))

  const items = novel.chapters.map((c) => ({
    label: nonEmptyLabel(`${downloadedEpisodes.has(c.episode) ? DOWNLOADED_MARKER : ''}${c.episode}. ${c.title}`),
    value: c,
  }))
  // Start the cursor on the last-read chapter (no list rotation needed - the
  // menu window just opens scrolled to it).
  const initialCursor = lastReadEpisode ? novel.chapters.findIndex((c) => c.episode === lastReadEpisode) : 0
  const menu = createMenuState(novel.title, items, initialCursor < 0 ? 0 : initialCursor)

  return {
    state: { novelId, novelTitle: novel.title, chapters: novel.chapters, downloadedEpisodes, menu },
    spec: menuSpec(menu),
  }
}
