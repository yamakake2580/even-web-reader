// The host rejects a list container whose total text is too large - NOT by
// item count. Measured on hardware: a 6-item list totalling 110 chars of
// itemName text failed (createStartUpPageContainer/rebuildPageContainer
// returned invalid/false), while a 6-item list totalling 39 chars, and the
// bookshelf's ~86-char first page, rendered fine. So pages are split by a
// total-character budget, not a fixed item count. CONTENT_BUDGET is
// deliberately conservative (well under the ~90-char observed failure point,
// leaving room for the nav entries).
const CONTENT_BUDGET = 55
const PREV_PAGE_LABEL = '← 前のページ'
const NEXT_PAGE_LABEL = '次のページ →'

export function pagedContainerName(base: string, page: number): string {
  return `${base}_p${page}`
}

export interface Paginated<T> {
  pageItems: T[]
  page: number
  totalPages: number
  hasPrev: boolean
  hasNext: boolean
}

// Splits items into pages by cumulative label length (min one item per page,
// so a single over-budget title still gets its own page). Returns the page
// boundaries so a given page index maps back to the same slice every time.
function pageBoundaries<T>(items: T[], labelFor: (item: T) => string): number[] {
  const starts: number[] = []
  let i = 0
  while (i < items.length) {
    starts.push(i)
    let used = 0
    while (i < items.length) {
      const cost = labelFor(items[i]).length
      if (used > 0 && used + cost > CONTENT_BUDGET) break
      used += cost
      i += 1
    }
  }
  return starts.length > 0 ? starts : [0]
}

export function paginateItems<T>(items: T[], page: number, labelFor: (item: T) => string): Paginated<T> {
  const starts = pageBoundaries(items, labelFor)
  const totalPages = starts.length
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1)
  const start = starts[clampedPage]
  const end = clampedPage + 1 < totalPages ? starts[clampedPage + 1] : items.length
  return {
    pageItems: items.slice(start, end),
    page: clampedPage,
    totalPages,
    hasPrev: clampedPage > 0,
    hasNext: clampedPage < totalPages - 1,
  }
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
