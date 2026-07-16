import { TextContainerProperty } from '@evenrealities/even_hub_sdk'

// A bookshelf with ~36 novels (from bulk-adding favorites) made
// createStartUpPageContainer return 1 (invalid) - the host rejects list
// containers past some item-count/payload limit that is not documented.
// Capping items per screen and paging through them with swipe keeps every
// list request well under whatever that limit is. 15 is a conservative
// starting point, not a value taken from documentation.
export const LIST_PAGE_SIZE = 15

export interface Paginated<T> {
  pageItems: T[]
  page: number
  totalPages: number
}

export function paginateItems<T>(items: T[], page: number): Paginated<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE))
  const clampedPage = Math.min(Math.max(page, 0), totalPages - 1)
  const pageItems = items.slice(clampedPage * LIST_PAGE_SIZE, (clampedPage + 1) * LIST_PAGE_SIZE)
  return { pageItems, page: clampedPage, totalPages }
}

/** Small text container below a paged list, showing "page / totalPages". */
export function listPagerContainer(page: number, totalPages: number): TextContainerProperty {
  return new TextContainerProperty({
    xPosition: 0,
    yPosition: 255,
    width: 576,
    height: 33,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 2,
    containerName: 'pager',
    content: totalPages > 1 ? `${page + 1} / ${totalPages}  ·  swipe: page` : '',
    isEventCapture: 0,
  })
}
