import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovels, type NovelSummary } from '../api'
import { buildPagedItemNames, freshListContainerId, paginateItems, resolvePagedSelection, type PagedSelection } from './paging'
import type { PageSpec } from './types'

export interface BookshelfState {
  novels: NovelSummary[]
  page: number
  totalPages: number
}

export async function loadBookshelf(page = 0): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  const paginated = paginateItems(novels, page)
  const itemName = buildPagedItemNames(paginated, (n) => n.title, '(登録済みの小説がありません)')

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
        containerID: freshListContainerId(),
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
  }

  return { state: { novels, page: paginated.page, totalPages: paginated.totalPages }, spec }
}

export function selectedNovel(state: BookshelfState, event: List_ItemEvent): PagedSelection<NovelSummary> | null {
  const paginated = paginateItems(state.novels, state.page)
  // Known quirk: selecting the first item can arrive without
  // currentSelectItemIndex set at all, so default to index 0 rather than
  // dropping the event.
  return resolvePagedSelection(paginated, event.currentSelectItemIndex ?? 0)
}
