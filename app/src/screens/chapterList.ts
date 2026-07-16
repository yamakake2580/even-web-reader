import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovel, type ChapterMeta } from '../api'
import { listPagerContainer, paginateItems } from './paging'
import { isChapterSavedOffline } from '../storage'
import type { PageSpec } from './types'

export interface ChapterListState {
  novelId: string
  novelTitle: string
  chapters: ChapterMeta[]
  lastReadEpisode?: string
  downloadedEpisodes: Set<string>
  page: number
  totalPages: number
}

// The SDK's list container has no field to set an initial selected/focused
// index or scroll offset - itemName is the only per-item content it
// accepts, and the cursor always starts at item 0. With a long chapter list,
// landing back on chapter 1 every time you back out of the reader means
// scrolling all the way down again to find your place. Rotating the list so
// the last-read chapter is item 0 fixes that with no SDK support needed -
// it's simply always the first thing you see, no scrolling required.
export const LAST_READ_MARKER = '▶ '
// Chapters saved for offline reading (via reading them once, or the
// download-all/download-selected buttons) get this marker so it is visible
// on the glasses themselves which ones do not need the backend to open.
export const DOWNLOADED_MARKER = '✓ '

function rotateToStart<T>(items: T[], startIndex: number): T[] {
  if (startIndex <= 0) return items
  return [...items.slice(startIndex), ...items.slice(0, startIndex)]
}

export async function loadChapterList(
  novelId: string,
  lastReadEpisode?: string,
  page = 0,
): Promise<{ state: ChapterListState; spec: PageSpec }> {
  const novel = await fetchNovel(novelId)
  const lastReadIndex = lastReadEpisode ? novel.chapters.findIndex((c) => c.episode === lastReadEpisode) : -1
  const chapters = lastReadIndex > 0 ? rotateToStart(novel.chapters, lastReadIndex) : novel.chapters

  const downloaded = await Promise.all(chapters.map((c) => isChapterSavedOffline(novelId, c.episode)))
  const downloadedEpisodes = new Set(chapters.filter((_, i) => downloaded[i]).map((c) => c.episode))

  // Paginated for the glasses list container only (payload/item-count limit -
  // see paging.ts). The full `chapters` array is kept in state for the
  // phone-side UI and download-all, which have no such limit.
  const { pageItems, page: clampedPage, totalPages } = paginateItems(chapters, page)
  const itemName =
    pageItems.length > 0
      ? pageItems.map((c) => {
          const marker =
            (c.episode === lastReadEpisode ? LAST_READ_MARKER : '') + (downloadedEpisodes.has(c.episode) ? DOWNLOADED_MARKER : '')
          // Some chapter titles (prologue/epilogue/etc.) carry no number of
          // their own, making position in a long list hard to track -
          // prefix the site's own episode number for every chapter.
          return `${marker}${c.episode}. ${c.title}`
        })
      : ['(話がありません)']

  const spec: PageSpec = {
    containerTotalNum: 2,
    listObject: [
      new ListContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 250,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: 1,
        containerName: 'chapterList',
        isEventCapture: 1,
        itemContainer: new ListItemContainerProperty({
          itemCount: itemName.length,
          itemWidth: 576,
          isItemSelectBorderEn: 1,
          itemName,
        }),
      }),
    ],
    textObject: [listPagerContainer(clampedPage, totalPages)],
  }

  return {
    state: { novelId, novelTitle: novel.title, chapters, lastReadEpisode, downloadedEpisodes, page: clampedPage, totalPages },
    spec,
  }
}

export function selectedChapter(state: ChapterListState, event: List_ItemEvent): ChapterMeta | null {
  const { pageItems } = paginateItems(state.chapters, state.page)
  if (pageItems.length === 0) return null
  // Same index-0 quirk as bookshelf.ts's selectedNovel - see comment there.
  return pageItems[event.currentSelectItemIndex ?? 0] ?? null
}
