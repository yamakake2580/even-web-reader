import { TextContainerProperty, TextContainerUpgrade, type EvenAppBridge } from '@evenrealities/even_hub_sdk'

// Selectable menus are built from TEXT containers with a moving cursor, NOT
// the native list container - per the community UI patterns doc, that is the
// recommended approach (the native ListContainerProperty rejects large item
// counts as an invalid config, and changing its items needs a full page
// rebuild). Here the whole list lives in app state; a window of it is drawn
// into one text container, and scrolling just moves the cursor and redraws
// via textContainerUpgrade - flicker-free and reliable, exactly like the
// reader's page turns. No pagination, no per-page rebuilds.

const HEADER_ID = 1
const HEADER_NAME = 'menuHeader'
const BODY_ID = 2
const BODY_NAME = 'menuBody'
// ~27px line height on a 288px canvas; leave a line for the header.
const VISIBLE_ROWS = 8

export interface MenuItem<T> {
  label: string
  value: T
}

export interface MenuState<T> {
  title: string
  items: MenuItem<T>[]
  cursor: number
  windowStart: number
}

export function createMenuState<T>(title: string, items: MenuItem<T>[], initialCursor = 0): MenuState<T> {
  const cursor = items.length === 0 ? 0 : Math.min(Math.max(initialCursor, 0), items.length - 1)
  const windowStart = clampWindowStart(cursor, items.length)
  return { title, items, cursor, windowStart }
}

function clampWindowStart(cursor: number, total: number): number {
  if (total <= VISIBLE_ROWS) return 0
  // Keep the cursor inside the window; scroll only when it would fall off.
  let start = cursor - Math.floor(VISIBLE_ROWS / 2)
  start = Math.max(0, Math.min(start, total - VISIBLE_ROWS))
  return start
}

function headerText<T>(state: MenuState<T>): string {
  const pos = state.items.length === 0 ? '' : `  (${state.cursor + 1}/${state.items.length})`
  return `${state.title}${pos}`
}

function bodyText<T>(state: MenuState<T>): string {
  if (state.items.length === 0) return '(なし)'
  const end = Math.min(state.windowStart + VISIBLE_ROWS, state.items.length)
  const lines: string[] = []
  for (let i = state.windowStart; i < end; i++) {
    lines.push(`${i === state.cursor ? '▶ ' : '   '}${state.items[i].label}`)
  }
  return lines.join('\n')
}

/** Page layout for entering a menu screen (used with create/rebuild). */
export function menuSpec<T>(state: MenuState<T>) {
  return {
    containerTotalNum: 2,
    textObject: [
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 0,
        width: 576,
        height: 30,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: HEADER_ID,
        containerName: HEADER_NAME,
        content: headerText(state),
        isEventCapture: 0,
      }),
      new TextContainerProperty({
        xPosition: 0,
        yPosition: 32,
        width: 576,
        height: 256,
        borderWidth: 0,
        borderColor: 5,
        paddingLength: 4,
        containerID: BODY_ID,
        containerName: BODY_NAME,
        content: bodyText(state),
        isEventCapture: 1,
      }),
    ],
  }
}

// Serialize upgrades so fast scrolling can't queue overlapping writes.
let rendering: Promise<unknown> = Promise.resolve()

/** Redraws the menu in place (no page rebuild). */
export function renderMenu(bridge: EvenAppBridge, state: MenuState<unknown>): Promise<unknown> {
  rendering = rendering.then(async () => {
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: BODY_ID, containerName: BODY_NAME, content: bodyText(state) }),
    )
    await bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: HEADER_ID, containerName: HEADER_NAME, content: headerText(state) }),
    )
  })
  return rendering
}

/** Moves the cursor by delta (with wrap-around) and re-windows. Returns whether it moved. */
export function moveCursor(state: MenuState<unknown>, delta: number): boolean {
  if (state.items.length === 0) return false
  const next = (state.cursor + delta + state.items.length) % state.items.length
  if (next === state.cursor) return false
  state.cursor = next
  state.windowStart = clampWindowStart(state.cursor, state.items.length)
  return true
}

export function selectedItem<T>(state: MenuState<T>): T | null {
  return state.items[state.cursor]?.value ?? null
}
