// A bookshelf with ~36 novels (from bulk-adding favorites) made
// createStartUpPageContainer return 1 (invalid) - the host rejects list
// containers past some item-count/payload limit that is not documented.
// Capping items per screen keeps every list request well under whatever
// that limit is.
// TEMP diagnostic: 5 items + a next-page entry (6 total) worked for the
// very first createStartUpPageContainer call, but paging to a page with
// both prev+next entries (7 total with 5 real items) failed at
// rebuildPageContainer specifically. Dropping further so every page -
// including ones with both sentinels - stays at or under what already
// worked once.
export const LIST_PAGE_SIZE = 3

// Swipe (SCROLL_TOP/SCROLL_BOTTOM) on a list container turns out to move the
// host's own focus cursor between the currently-rendered items rather than
// reaching our event handler as a page-change signal - confirmed on real
// hardware (focus moves item 1->5, then does nothing past the last one).
// So paging is done with ordinary selectable list items instead, appended
// to the list itself: tap-to-select is already proven reliable.
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
  const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems = items.slice(clampedPage * LIST_PAGE_SIZE, (clampedPage + 1) * LIST_PAGE_SIZE);
  return { pageItems, page: clampedPage, totalPages, hasPrev: clampedPage > 0, hasNext: clampedPage < totalPages - 1 };
}

/** Builds the list container's itemName array: [prev?, ...items, next?]. */
export function buildPagedItemNames<T>(paginated: Paginated<T>, labelFor: (item: T) => string, emptyLabel: string): string[] {
  const names: string[] = [];
  if (paginated.hasPrev) names.push(PREV_PAGE_LABEL);
  if (paginated.pageItems.length > 0) {
    names.push(...paginated.pageItems.map(labelFor));
  } else if (!paginated.hasPrev && !paginated.hasNext) {
    names.push(emptyLabel);
  }
  if (paginated.hasNext) names.push(NEXT_PAGE_LABEL);
  return names;
}

// TEMP diagnostic: page 0->1 (first rebuildPageContainer call) succeeded,
// page 1->2 (second, with an identical item count/shape) failed even after
// spacing the calls out and retrying. Testing whether reusing the exact
// same containerID/containerName across repeated rebuilds is itself the
// problem - each paged list screen now gets a fresh id.
let nextListContainerId = 100
export function freshListContainerId(): number {
  nextListContainerId += 1
  return nextListContainerId
}

export type PagedSelection<T> = { kind: 'item'; value: T } | { kind: 'prevPage' } | { kind: 'nextPage' };

/** Maps a List_ItemEvent's currentSelectItemIndex back through the prev/next entries. */
export function resolvePagedSelection<T>(paginated: Paginated<T>, selectedIndex: number): PagedSelection<T> | null {
  let index = selectedIndex;
  if (paginated.hasPrev) {
    if (index === 0) return { kind: 'prevPage' };
    index -= 1;
  }
  if (index < paginated.pageItems.length) {
    const value = paginated.pageItems[index];
    return value === undefined ? null : { kind: 'item', value };
  }
  if (paginated.hasNext) return { kind: 'nextPage' };
  return null;
}
