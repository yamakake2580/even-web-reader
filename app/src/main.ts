import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { fetchChapter, importFavorites, registerNovel } from './api'
import { loadBookshelf, selectedNovel, type BookshelfState } from './screens/bookshelf'
import { LAST_READ_MARKER, loadChapterList, selectedChapter, type ChapterListState } from './screens/chapterList'
import { loadReader, showReaderPage, pagerLabel, type ReaderState } from './screens/reader'
import type { PageSpec } from './screens/types'
import {
  getReadingPosition,
  getStorage,
  initStorage,
  isChapterSavedOffline,
  saveOfflineChapter,
  setReadingPosition,
  setStorage,
} from './storage'

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
    const saved = getReadingPosition()
    const lastReadEpisode = saved && saved.novelId === novelId ? saved.episode : undefined
    const { state, spec } = await loadChapterList(novelId, lastReadEpisode)
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

// Real G2 hardware delivers tap/scroll events via event.sysEvent; the
// desktop simulator delivers the same logical events via event.textEvent
// (or event.listEvent for list screens) instead. Checking every envelope
// for a given eventType, rather than picking just one, is the only way
// input works identically on both - see docs/sdk-quirks.md "Quirk 2" at
// https://github.com/aleapc/even-hub-devguide.
function hasEventType(event: EvenHubEvent, type: OsEventTypeList): boolean {
  return (
    event.sysEvent?.eventType === type ||
    event.textEvent?.eventType === type ||
    event.listEvent?.eventType === type
  )
}

// A single physical swipe has been observed producing several rapid
// SCROLL_TOP/SCROLL_BOTTOM dispatches; a cooldown avoids turning many pages
// per swipe or double-navigating on what the user experienced as one tap.
const EVENT_DEBOUNCE_MS = 300
let lastEventAt = 0

const unsubscribe = bridge.onEvenHubEvent((event) => {
  const now = Date.now()
  if (now - lastEventAt < EVENT_DEBOUNCE_MS) return
  lastEventAt = now

  if (!screen) return

  if (hasEventType(event, OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    if (screen.name === 'bookshelf') {
      bridge.shutDownPageContainer(1)
    } else if (screen.name === 'chapterList') {
      goToBookshelf().catch((err) => console.error(err))
    } else if (screen.name === 'reader') {
      goToChapterList(screen.state.novelId).catch((err) => console.error(err))
    }
    return
  }

  // A List_ItemEvent payload (which carries currentSelectItemIndex) is itself
  // the selection signal - it is only ever sent for a selection, and
  // double-click on a list already returned above, so no eventType check
  // is needed (or reliable enough to require) here.
  if (screen.name === 'bookshelf' && event.listEvent) {
    const novel = selectedNovel(screen.state, event.listEvent)
    if (novel) goToChapterList(novel.id).catch((err) => console.error(err))
    return
  }

  if (screen.name === 'chapterList' && event.listEvent) {
    const chapter = selectedChapter(screen.state, event.listEvent)
    if (chapter) goToReader(screen.state.novelId, chapter.episode).catch((err) => console.error(err))
    return
  }

  if (screen.name === 'reader') {
    const readerState = screen.state

    if (hasEventType(event, OsEventTypeList.SCROLL_TOP_EVENT)) {
      turnReaderPage(readerState, readerState.currentPage - 1).catch((err) => console.error(err))
      return
    }
    if (
      hasEventType(event, OsEventTypeList.SCROLL_BOTTOM_EVENT) ||
      hasEventType(event, OsEventTypeList.CLICK_EVENT)
    ) {
      turnReaderPage(readerState, readerState.currentPage + 1).catch((err) => console.error(err))
      return
    }
  }

  if (hasEventType(event, OsEventTypeList.SYSTEM_EXIT_EVENT) || hasEventType(event, OsEventTypeList.ABNORMAL_EXIT_EVENT)) {
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
    <div id="downloadSection" style="display:none;margin-top:12px;">
      <button id="downloadAllBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;width:100%;">この小説を全話ダウンロード</button>
      <div id="downloadStatus" style="font-size:12px;color:#919191;margin-top:6px;"></div>
    </div>
    <footer style="font-size:12px;color:#7B7B7B;text-align:center;margin-top:16px;">
      Tap glasses: select / next page · swipe up: previous · double-tap: back
    </footer>
    <section style="margin-top:24px;padding-top:16px;border-top:1px solid #3E3E3E;display:flex;flex-direction:column;gap:12px;">
      <label style="font-size:12px;color:#919191;display:flex;flex-direction:column;gap:4px;">
        Backend URL
        <input id="backendUrlInput" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="http://192.168.x.x:8787" style="padding:8px;border-radius:6px;border:1px solid #3E3E3E;background:#1E1E1E;color:#E5E5E5;" />
      </label>
      <button id="backendUrlSave" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">Save backend URL</button>
      <label style="font-size:12px;color:#919191;display:flex;flex-direction:column;gap:4px;">
        Add novel by Hameln URL
        <input id="novelUrlInput" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://syosetu.org/novel/1/" style="padding:8px;border-radius:6px;border:1px solid #3E3E3E;background:#1E1E1E;color:#E5E5E5;" />
      </label>
      <button id="novelUrlAdd" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">Add novel</button>
      <span id="companionStatus" style="font-size:12px;color:#919191;"></span>
      <button id="importFavoritesBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;margin-top:8px;">ハーメルンのお気に入りを一括インポート</button>
      <span id="importFavoritesStatus" style="font-size:12px;color:#919191;"></span>
    </section>
    <div style="height:40vh;"></div>
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
  // Retry whichever screen is active (most importantly: bookshelf, which is
  // likely showing the "backend unreachable" error from before the URL was
  // corrected) now that the URL has changed.
  if (!screen || screen.name === 'bookshelf') {
    goToBookshelf().catch((err) => console.error(err))
  } else if (screen.name === 'chapterList') {
    goToChapterList(screen.state.novelId).catch((err) => console.error(err))
  } else if (screen.name === 'reader') {
    goToReader(screen.state.novelId, screen.state.episode).catch((err) => console.error(err))
  }
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

document.getElementById('importFavoritesBtn')?.addEventListener('click', () => {
  const statusEl = document.getElementById('importFavoritesStatus')
  if (statusEl) statusEl.textContent = 'インポート中...（お気に入りの件数によっては数分かかります）'
  importFavorites()
    .then((result) => {
      if (statusEl) {
        statusEl.textContent = `完了: ${result.registered}件登録 / ${result.failed}件失敗 (お気に入り全${result.totalFavorites}件)`
      }
      if (screen?.name === 'bookshelf') return goToBookshelf()
    })
    .catch((err) => {
      console.error(err)
      if (statusEl) statusEl.textContent = 'インポートに失敗しました（HAMELN_COOKIEの設定を確認してください）'
    })
})

// Sequential on purpose: avoids hammering the backend with many concurrent
// requests when a novel has dozens/hundreds of chapters, and lets the
// status line show real progress instead of an all-or-nothing result.
async function downloadAllChapters(state: ChapterListState): Promise<void> {
  const statusEl = document.getElementById('downloadStatus')
  let saved = 0
  let skipped = 0
  let failed = 0
  for (const chapter of state.chapters) {
    if (statusEl) statusEl.textContent = `ダウンロード中... ${saved + skipped + failed} / ${state.chapters.length}`
    if (await isChapterSavedOffline(state.novelId, chapter.episode)) {
      skipped++
      continue
    }
    try {
      const content = await fetchChapter(state.novelId, chapter.episode)
      await saveOfflineChapter(state.novelId, chapter.episode, content)
      saved++
    } catch (err) {
      console.error(err)
      failed++
    }
  }
  if (statusEl) {
    statusEl.textContent = `完了: ${saved}件保存 / ${skipped}件は保存済み / ${failed}件失敗`
  }
}

document.getElementById('downloadAllBtn')?.addEventListener('click', () => {
  if (!screen || screen.name !== 'chapterList') return
  downloadAllChapters(screen.state).catch((err) => console.error(err))
})

function mirrorCompanion(): void {
  const title = document.getElementById('screenTitle')
  const mirror = document.getElementById('mirror')
  const count = document.getElementById('pageCount')
  const status = document.getElementById('companionStatus')
  const downloadSection = document.getElementById('downloadSection')
  if (status && lastError) status.textContent = lastError
  if (!title || !mirror || !count || !screen) return

  if (downloadSection) {
    downloadSection.style.display = screen.name === 'chapterList' ? 'block' : 'none'
  }

  if (screen.name === 'bookshelf') {
    title.textContent = '本棚'
    count.textContent = `${screen.state.novels.length} 冊`
    mirror.innerHTML = listHtml(screen.state.novels.map((n) => n.title))
  } else if (screen.name === 'chapterList') {
    const chapterListState = screen.state
    title.textContent = chapterListState.novelTitle
    count.textContent = `${chapterListState.chapters.length} 話`
    mirror.innerHTML = listHtml(
      chapterListState.chapters.map((c) =>
        c.episode === chapterListState.lastReadEpisode ? `${LAST_READ_MARKER}${c.title}` : c.title,
      ),
    )
    const downloadStatus = document.getElementById('downloadStatus')
    if (downloadStatus) downloadStatus.textContent = ''
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
