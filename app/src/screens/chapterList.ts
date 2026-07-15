import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovel, type ChapterMeta } from '../api'
import type { PageSpec } from './types'

export interface ChapterListState {
  novelId: string
  novelTitle: string
  chapters: ChapterMeta[]
  lastReadEpisode?: string
}

// The SDK's list container has no field to set an initial selected/focused
// index or scroll offset - itemName is the only per-item content it
// accepts, and the cursor always starts at item 0. With a long chapter list,
// landing back on chapter 1 every time you back out of the reader means
// scrolling all the way down again to find your place. Rotating the list so
// the last-read chapter is item 0 fixes that with no SDK support needed -
// it's simply always the first thing you see, no scrolling required.
export const LAST_READ_MARKER = '▶ '

function rotateToStart<T>(items: T[], startIndex: number): T[] {
  if (startIndex <= 0) return items
  return [...items.slice(startIndex), ...items.slice(0, startIndex)]
}

export async function loadChapterList(
  novelId: string,
  lastReadEpisode?: string,
): Promise<{ state: ChapterListState; spec: PageSpec }> {
  const novel = await fetchNovel(novelId)
  const lastReadIndex = lastReadEpisode ? novel.chapters.findIndex((c) => c.episode === lastReadEpisode) : -1
  const chapters = lastReadIndex > 0 ? rotateToStart(novel.chapters, lastReadIndex) : novel.chapters
  const itemName =
    chapters.length > 0
      ? chapters.map((c) => (c.episode === lastReadEpisode ? `${LAST_READ_MARKER}${c.title}` : c.title))
      : ['(話がありません)']

  const spec: PageSpec = {
    containerTotalNum: 1,
    listObject: [
      new ListContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 288,
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
  }

  return { state: { novelId, novelTitle: novel.title, chapters, lastReadEpisode }, spec }
}

export function selectedChapter(state: ChapterListState, event: List_ItemEvent): ChapterMeta | null {
  if (state.chapters.length === 0) return null
  // Same index-0 quirk as bookshelf.ts's selectedNovel - see comment there.
  return state.chapters[event.currentSelectItemIndex ?? 0] ?? null
}
