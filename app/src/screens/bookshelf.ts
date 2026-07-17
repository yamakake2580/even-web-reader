import { fetchNovels, type NovelSummary } from '../api'
import { createMenuState, menuSpec, type MenuState } from './menu'
import { nonEmptyLabel } from './util'
import type { PageSpec } from './types'

export interface BookshelfState {
  novels: NovelSummary[]
  menu: MenuState<NovelSummary>
}

export async function loadBookshelf(): Promise<{ state: BookshelfState; spec: PageSpec }> {
  const novels = await fetchNovels()
  const items = novels.map((n) => ({ label: nonEmptyLabel(n.title), value: n }))
  const menu = createMenuState('本棚', items)
  return { state: { novels, menu }, spec: menuSpec(menu) }
}
