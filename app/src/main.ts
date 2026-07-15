import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { registerNovel } from './api'
import { loadBookshelf, selectedNovel, type BookshelfState } from './screens/bookshelf'
import { loadChapterList, selectedChapter, type ChapterListState } from './screens/chapterList'
import { loadReader, showReaderPage, pagerLabel, type ReaderState } from './screens/reader'
import type { PageSpec } from './screens/types'
import { getReadingPosition, getStorage, initStorage, setReadingPosition, setStorage } from './storage'

const bridge = await waitForEvenAppBridge()
await initStorage(bridge)

type Screen =
  | { name: 'bookshelf'; state: BookshelfState }
  | { name: 'chapterList'; state: ChapterListState }
  | { name: 'reader'; state: ReaderState }

let screen: Screen | null = null

// createStartUpPageContainer is required for an app's very first screen;
// every screen transition after that must use rebuildPageContainer instead.
let launched = false
async function present(spec: PageSpec): Promise<void> {
  if (!launched) {
    launched = true
    const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(spec))
    if (result !== 0) console.error('createStartUpPageContainer failed:', result)
  } else {
    const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(spec))
    if (!ok) console.error('rebuildPageContainer failed')
  }
}

// Backend-unreachable (or other load failure) handling: leave whatever was
// last successfully shown on the glasses in place rather than tearing it
// down, and surface the failure on the phone-side status line where the
// user can act on it (e.g. fix the backend URL). If nothing has ever been
// shown yet (very first launch fails), fall back to a one-off error text
// container so the glasses aren't left blank.
let lastError: string | null = null

async function presentError(message: string): Promise<void> {
  lastError = message
  if (!launched) {
    await present({
      containerTotalNum: 1,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 288,
          borderWidth: 0,
          borderColor: 5,
          paddingLength: 8,
          containerID: 1,
          containerName: 'error',
          content: message,
          isEventCapture: 0,
        }),
      ],
    })
  }
}

async function goToBookshelf(): Promise<void> {
  try {
    const { state, spec } = await loadBookshelf()
    screen = { name: 'bookshelf', state }
    lastError = null
    await present(spec)
  } catch (err) {
    console.error(err)
    await presentError('本棚を取得できませんでした。Backend URLを確認してください。')
  }
  mirrorCompanion()
}

async function goToChapterList(novelId: string): Promise<void> {
  try {
    const { state, spec } = await loadChapterList(novelId)
    screen = { name: 'chapterList', state }
    lastError = null
    await present(spec)
  } catch (err) {
    console.error(err)
    lastError = '話数リストを取得できませんでした。'
  }
  mirrorCompanion()
}

async function goToReader(novelId: string, episode: string): Promise<void> {
  try {
    const saved = getReadingPosition()
    const startPage = saved && saved.novelId === novelId && saved.episode === episode ? saved.pageIndex : 0
    const { state, spec } = await loadReader(novelId, episode, startPage)
    screen = { name: 'reader', state }
    lastError = null
    setReadingPosition({ novelId, episode, pageIndex: state.currentPage })
    await present(spec)
  } catch (err) {
    console.error(err)
    lastError = '本文を取得できませんでした。'
  }
  mirrorCompanion()
}

async function turnReaderPage(state: ReaderState, index: number): Promise<void> {
  const changed = await showReaderPage(bridge, state, index)
  if (changed) {
    setReadingPosition({ novelId: state.novelId, episode: state.episode, pageIndex: state.currentPage })
  }
  mirrorCompanion()
}

function isDoubleClick(event: EvenHubEvent): boolean {
  return (
    event.sysEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    event.textEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT ||
    event.listEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT
  )
}

// Some devices/hosts have been observed delivering a single physical tap as
// more than one event; a short cooldown avoids double-advancing pages or
// double-navigating on what the user experienced as one tap.
const EVENT_DEBOUNCE_MS = 150
let lastEventAt = 0

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const now = Date.now()
  if (now - lastEventAt < EVENT_DEBOUNCE_MS) return
  lastEventAt = now

  if (!screen) return

  if (isDoubleClick(event)) {
    if (screen.name === 'bookshelf') {
      bridge.shutDownPageContainer(1)
    } else if (screen.name === 'chapterList') {
      goToBookshelf().catch((err) => console.error(err))
    } else if (screen.name === 'reader') {
      goToChapterList(screen.state.novelId).catch((err) => console.error(err))
    }
    return
  }

  if (screen.name === 'bookshelf' && event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT) {
    const novel = selectedNovel(screen.state, event.listEvent)
    if (novel) goToChapterList(novel.id).catch((err) => console.error(err))
    return
  }

  if (screen.name === 'chapterList' && event.listEvent?.eventType === OsEventTypeList.CLICK_EVENT) {
    const chapter = selectedChapter(screen.state, event.listEvent)
    if (chapter) goToReader(screen.state.novelId, chapter.episode).catch((err) => console.error(err))
    return
  }

  if (screen.name === 'reader') {
    const textType = event.textEvent?.eventType ?? null
    const sysType = event.sysEvent?.eventType ?? null
    const readerState = screen.state

    if (textType === OsEventTypeList.SCROLL_TOP_EVENT) {
      turnReaderPage(readerState, readerState.currentPage - 1).catch((err) => console.error(err))
      return
    }
    if (textType === OsEventTypeList.SCROLL_BOTTOM_EVENT || sysType === OsEventTypeList.CLICK_EVENT) {
      turnReaderPage(readerState, readerState.currentPage + 1).catch((err) => console.error(err))
      return
    }
  }

  const sysType = event.sysEvent?.eventType ?? null
  if (sysType === OsEventTypeList.SYSTEM_EXIT_EVENT || sysType === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    cleanup()
  }
})

let cleanedUp = false
function cleanup(): void {
  if (cleanedUp) return
  cleanedUp = true
  unsubscribe()
}
window.addEventListener('beforeunload', cleanup)

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main style="margin:auto;padding:24px;max-width:680px;box-sizing:border-box;">
    <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h1 id="screenTitle" style="font-size:18px;font-weight:600;margin:0;">Even Web Reader</h1>
      <span id="pageCount" style="font-size:12px;color:#919191;"></span>
    </header>
    <div id="mirror" style="background:#2E2E2E;border:1px solid #3E3E3E;border-radius:12px;padding:20px;font-size:15px;line-height:1.55;color:#E5E5E5;margin:0;"></div>
    <footer style="font-size:12px;color:#7B7B7B;text-align:center;margin-top:16px;">
      Tap glasses: select / next page · swipe up: previous · double-tap: back
    </footer>
    <section style="margin-top:24px;padding-top:16px;border-top:1px solid #3E3E3E;display:flex;flex-direction:column;gap:12px;">
      <label style="font-size:12px;color:#919191;display:flex;flex-direction:column;gap:4px;">
        Backend URL
        <input id="backendUrlInput" type="text" placeholder="http://192.168.x.x:8787" style="padding:8px;border-radius:6px;border:1px solid #3E3E3E;background:#1E1E1E;color:#E5E5E5;" />
      </label>
      <button id="backendUrlSave" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">Save backend URL</button>
      <label style="font-size:12px;color:#919191;display:flex;flex-direction:column;gap:4px;">
        Add novel by Hameln URL
        <input id="novelUrlInput" type="text" placeholder="https://syosetu.org/novel/1/" style="padding:8px;border-radius:6px;border:1px solid #3E3E3E;background:#1E1E1E;color:#E5E5E5;" />
      </label>
      <button id="novelUrlAdd" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">Add novel</button>
      <span id="companionStatus" style="font-size:12px;color:#919191;"></span>
    </section>
  </main>
`

const backendUrlInput = document.getElementById('backendUrlInput') as HTMLInputElement
const novelUrlInput = document.getElementById('novelUrlInput') as HTMLInputElement
const companionStatus = document.getElementById('companionStatus') as HTMLSpanElement
backendUrlInput.value = getStorage('backend_url') ?? ''

document.getElementById('backendUrlSave')?.addEventListener('click', () => {
  const value = backendUrlInput.value.trim()
  if (!value) return
  setStorage('backend_url', value)
  companionStatus.textContent = 'Backend URLを保存しました'
})

document.getElementById('novelUrlAdd')?.addEventListener('click', () => {
  const url = novelUrlInput.value.trim()
  if (!url) return
  companionStatus.textContent = '登録中...'
  registerNovel(url)
    .then((novel) => {
      companionStatus.textContent = `登録しました: ${novel.title}`
      novelUrlInput.value = ''
      if (screen?.name === 'bookshelf') return goToBookshelf()
    })
    .catch((err) => {
      console.error(err)
      companionStatus.textContent = '登録に失敗しました'
    })
})

function mirrorCompanion(): void {
  const title = document.getElementById('screenTitle')
  const mirror = document.getElementById('mirror')
  const count = document.getElementById('pageCount')
  const status = document.getElementById('companionStatus')
  if (status && lastError) status.textContent = lastError
  if (!title || !mirror || !count || !screen) return

  if (screen.name === 'bookshelf') {
    title.textContent = '本棚'
    count.textContent = `${screen.state.novels.length} 冊`
    mirror.innerHTML = listHtml(screen.state.novels.map((n) => n.title))
  } else if (screen.name === 'chapterList') {
    title.textContent = screen.state.novelTitle
    count.textContent = `${screen.state.chapters.length} 話`
    mirror.innerHTML = listHtml(screen.state.chapters.map((c) => c.title))
  } else {
    title.textContent = screen.state.title
    count.textContent = `${screen.state.currentPage + 1} / ${screen.state.pages.length}`
    mirror.innerHTML = `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;">${escapeHtml(
      screen.state.pages[screen.state.currentPage] ?? '',
    )}</pre><div style="font-size:12px;color:#919191;margin-top:12px;">${escapeHtml(pagerLabel(screen.state))}</div>`
  }
}

function listHtml(items: string[]): string {
  return `<ol style="margin:0;padding-left:20px;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}

await goToBookshelf()
