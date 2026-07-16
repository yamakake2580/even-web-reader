import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovels, type NovelSummary } from '../api'
import { listPagerContainer, paginateItems } from './paging'
import type { PageSpec } from './types'

export interface BookshelfState {
  novels: NovelSummary[]
  page: number
  totalPages: number
}

export async function loadBookshelf(page = 0): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  const { pageItems, page: clampedPage, totalPages } = paginateItems(novels, page)
  const itemName = pageItems.length > 0 ? pageItems.map((n) => n.title) : ['(登録済みの小説がありません)']

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
        containerName: 'bookshelf',
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

  return { state: { novels, page: clampedPage, totalPages }, spec }
}

export function selectedNovel(state: BookshelfState, event: List_ItemEvent): NovelSummary | null {
  const { pageItems } = paginateItems(state.novels, state.page)
  if (pageItems.length === 0) return null
  // Known quirk: selecting the first item can arrive without
  // currentSelectItemIndex set at all, so default to index 0 rather than
  // dropping the event.
  return pageItems[event.currentSelectItemIndex ?? 0] ?? null
}
