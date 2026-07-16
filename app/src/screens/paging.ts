// Two independent hardware limits shape this:
//
// 1. createStartUpPageContainer (the FIRST screen = the bookshelf) rejects a
//    list past a low item cap: 13 items returned 1 (invalid) on hardware,
//    while 6 items (5 novels + a next-page entry) rendered. The cap sits
//    somewhere in 6..12; the earlier "16-chapter list works" was reached via
//    rebuildPageContainer, which tolerates more than createStartUp does. To
//    stay safely under the createStartUp cap, a page holds 5 content items
//    (+ up to 2 nav entries = 7 max). The list scrolls natively within a page.
//
// 2. rebuildPageContainer to a list container that reuses the SAME
//    containerName as the currently-shown list fails (returns false) - this
//    is why paging bookshelf p1 -> p2 (both name "bookshelf") broke, while
//    bookshelf -> chapterList (different names) worked reliably all session.
//    So each page uses a distinct containerName (see pagedContainerName),
//    with containerID kept fixed at 1 so the container is replaced, not
//    accumulated.
export const LIST_PAGE_SIZE = 5

export function pagedContainerName(base: string, page: number): string {
  return `${base}_p${page}`
}

const PREV_PAGE_LABEL = '← 前のページ'
const NEXT_PAGE_LABEL = '次のページ →'

export interface Paginated<T> {
  pageItems: T[]
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
}

export function paginateItems<T>(items: T[], page: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE))
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1)
  const pageItems = items.slice(clampedPage * LIST_PAGE_SIZE, (clampedPage + 1) * LIST_PAGE_SIZE)
  return { pageItems, page: clampedPage, totalPages, hasPrev: clampedPage > 0, hasNext: clampedPage < totalPages - 1 }
}

/** Builds the list container's itemName array: [prev?, ...items, next?]. */
export function buildPagedItemNames<T>(
  paginated: Paginated<T>,
  labelFor: (item: T) => string,
  emptyLabel: string,
): string[] {
  const names: string[] = []
  if (paginated.hasPrev) names.push(PREV_PAGE_LABEL)
  if (paginated.pageItems.length > 0) names.push(...paginated.pageItems.map(labelFor))
  else if (!paginated.hasPrev && !paginated.hasNext) names.push(emptyLabel)
  if (paginated.hasNext) names.push(NEXT_PAGE_LABEL)
  return names
}

export type PagedSelection<T> = { kind: 'item'; value: T } | { kind: 'prevPage' } | { kind: 'nextPage' }

/** Maps a List_ItemEvent's currentSelectItemIndex back through the prev/next entries. */
export function resolvePagedSelection<T>(paginated: Paginated<T>, selectedIndex: number): PagedSelection<T> | null {
  let index = selectedIndex
  if (paginated.hasPrev) {
    if (index === 0) return { kind: 'prevPage' }
    index -= 1
  }
  if (index < paginated.pageItems.length) {
    const value = paginated.pageItems[index]
    return value === undefined ? null : { kind: 'item', value }
  }
  if (paginated.hasNext) return { kind: 'nextPage' }
  return null
}
