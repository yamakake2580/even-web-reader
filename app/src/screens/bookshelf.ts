import { fetchNovels, type NovelSummary } from '../api'
import { createMenuState, menuSpec, type MenuState } from './menu'
import { DOWNLOADED_MARKER } from './chapterList'
import { getOfflineChapterCount, getReadingPosition, getSeenChapterCount, setSeenChapterCount } from '../storage'
import { nonEmptyLabel } from './util'
import type { PageSpec } from './types'

// A synthetic bookshelf entry (not a real novel) that jumps straight to the
// saved reading position. Given a special id the click handler recognises.
export const CONTINUE_ID = '__continue__'

// Serials that gained chapters since last seen. ★ is proven to render on the
// glasses (it appears in real novel titles).
const NEW_MARKER = '★ '

export interface BookshelfState {
  novels: NovelSummary[]
  menu: MenuState<NovelSummary>
}

export async function loadBookshelf(): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  const offlineCounts = await Promise.all(novels.map((n) => getOfflineChapterCount(n.id)))
  const seenCounts = await Promise.all(novels.map((n) => getSeenChapterCount(n.id)))

  const items = await Promise.all(
    novels.map(async (n, i) => {
      // ● fully-downloaded marker: every chapter is saved offline.
      const fullyDownloaded = n.chapterCount > 0 && offlineCounts[i] >= n.chapterCount
      // ★ new-chapters marker: more chapters than last seen. First time a
      // novel is seen we just record its count (no flag), so only genuine
      // future increases light up.
      const seen = seenCounts[i]
      let isNew = false
      if (seen === null) {
        await setSeenChapterCount(n.id, n.chapterCount)
      } else if (n.chapterCount > seen) {
        isNew = true
      }
      const marker = (isNew ? NEW_MARKER : '') + (fullyDownloaded ? DOWNLOADED_MARKER : '')
      return { label: nonEmptyLabel(`${marker}${n.title}`), value: n }
    }),
  )

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
