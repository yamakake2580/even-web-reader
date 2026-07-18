import { fetchNovels, type NovelSummary } from '../api'
import { createMenuState, menuSpec, type MenuState } from './menu'
import { DOWNLOADED_MARKER } from './chapterList'
import { getOfflineChapterCount, getReadingPosition } from '../storage'
import { nonEmptyLabel } from './util'
import type { PageSpec } from './types'

// A synthetic bookshelf entry (not a real novel) that jumps straight to the
// saved reading position. Given a special id the click handler recognises.
export const CONTINUE_ID = '__continue__'

export interface BookshelfState {
  novels: NovelSummary[]
  menu: MenuState<NovelSummary>
}

export async function loadBookshelf(): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  // Mark novels whose every chapter is saved offline, so it is visible on the
  // glasses which ones are fully readable without the backend.
  const offlineCounts = await Promise.all(novels.map((n) => getOfflineChapterCount(n.id)))
  const items = novels.map((n, i) => {
    const fullyDownloaded = n.chapterCount > 0 && offlineCounts[i] >= n.chapterCount
    return { label: nonEmptyLabel(`${fullyDownloaded ? DOWNLOADED_MARKER : ''}${n.title}`), value: n }
  })

  // Prepend a "continue reading" shortcut when there is a saved position.
  const saved = getReadingPosition()
  if (saved) {
    const novel = novels.find((n) => n.id === saved.novelId)
    const label = novel ? `▶ 続きから: ${novel.title}` : '▶ 続きから読む'
    items.unshift({
      label: nonEmptyLabel(label),
      value: { id: CONTINUE_ID, title: '', author: '', chapterCount: 0 },
    })
  }

  const menu = createMenuState('本棚', items)
  return { state: { novels, menu }, spec: menuSpec(menu) }
}
