import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovel, type ChapterMeta } from '../api'
import type { PageSpec } from './types'

export interface ChapterListState {
  novelId: string
  novelTitle: string
  chapters: ChapterMeta[]
}

export async function loadChapterList(novelId: string): Promise<{ state: ChapterListState; spec: PageSpec }> {
  const novel = await fetchNovel(novelId)
  const itemName = novel.chapters.length > 0 ? novel.chapters.map((c) => c.title) : ['(話がありません)']

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

  return { state: { novelId, novelTitle: novel.title, chapters: novel.chapters }, spec }
}

export function selectedChapter(state: ChapterListState, event: List_ItemEvent): ChapterMeta | null {
  if (state.chapters.length === 0) return null
  // Same index-0 quirk as bookshelf.ts's selectedNovel - see comment there.
  return state.chapters[event.currentSelectItemIndex ?? 0] ?? null
}
