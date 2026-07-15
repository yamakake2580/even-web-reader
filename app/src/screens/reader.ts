import { TextContainerProperty, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { fetchChapter } from '../api'
import { paginate } from '../paginate'
import type { PageSpec } from './types'

// Body container geometry. Inner box (width/height minus padding and border)
// is what pretext measures against, so keep these in sync if you resize.
const BODY_W = 576
const BODY_H = 240
const BODY_PAD = 4
const BODY_BORDER = 0
const INNER_W = BODY_W - 2 * (BODY_PAD + BODY_BORDER)
const INNER_H = BODY_H - 2 * (BODY_PAD + BODY_BORDER)

export interface ReaderState {
  novelId: string
  episode: string
  title: string
  pages: string[]
  currentPage: number
}

export async function loadReader(novelId: string, episode: string, startPage = 0): Promise<{ state: ReaderState; spec: PageSpec }> {
  const chapter = await fetchChapter(novelId, episode)
  const pages = paginate(chapter.text, { width: INNER_W, height: INNER_H })
  const currentPage = pages.length === 0 ? 0 : Math.min(Math.max(startPage, 0), pages.length - 1)
  const state: ReaderState = { novelId, episode, title: chapter.title, pages, currentPage }

  const spec: PageSpec = {
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: BODY_W,
        height: BODY_H,
        borderWidth: BODY_BORDER,
        borderColor: 5,
        paddingLength: BODY_PAD,
        containerID: 1,
        containerName: 'body',
        content: pages[currentPage] ?? '(empty)',
        isEventCapture: 1,
      }),
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 250,
        width: 576,
        height: 30,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: 2,
        containerName: 'pager',
        content: pagerLabel(state),
        isEventCapture: 0,
      }),
    ],
  }

  return { state, spec }
}

export function pagerLabel(state: ReaderState): string {
  return `${state.currentPage + 1} / ${state.pages.length}  ·  tap: next  ·  swipe up: prev  ·  double-tap: back`
}

// Serialize bridge writes so a fast-tapping user can't queue overlapping upgrades.
let rendering: Promise<unknown> = Promise.resolve()

export async function showReaderPage(bridge: EvenAppBridge, state: ReaderState, index: number): Promise<boolean> {
  if (index < 0 || index >= state.pages.length || index === state.currentPage) return false
  state.currentPage = index
  rendering = rendering.then(async () => {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: 'body', content: state.pages[index] }),
    )
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 2, containerName: 'pager', content: pagerLabel(state) }),
    )
  })
  await rendering
  return true
}
