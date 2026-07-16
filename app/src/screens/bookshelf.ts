import { ListContainerProperty, ListItemContainerProperty, type List_ItemEvent } from '@evenrealities/even_hub_sdk'
import { fetchNovels, type NovelSummary } from '../api'
import { nonEmptyLabel } from './util'
import type { PageSpec } from './types'

export interface BookshelfState {
  novels: NovelSummary[]
}

export async function loadBookshelf(): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  // One list container with every novel; the glasses list scrolls natively.
  const itemName = novels.length > 0 ? novels.map((n) => nonEmptyLabel(n.title)) : ['(登録済みの小説がありません)']

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

  return { state: { novels }, spec }
}

export function selectedNovel(state: BookshelfState, event: List_ItemEvent): NovelSummary | null {
  if (state.novels.length === 0) return null
  // Known quirk: selecting the first item can arrive without
  // currentSelectItemIndex set at all, so default to index 0 rather than
  // dropping the event.
  return state.novels[event.currentSelectItemIndex ?? 0] ?? null
}
