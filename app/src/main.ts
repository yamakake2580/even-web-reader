import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  OsEventTypeList,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import {
  fetchChapter,
  fetchFavoritesPage,
  fetchNovel,
  fetchNovels,
  registerNovel,
  type ChapterMeta,
  type FavoriteNovel,
} from './api'
import { loadBookshelf, type BookshelfState } from './screens/bookshelf'
import { DOWNLOADED_MARKER, loadChapterList, type ChapterListState } from './screens/chapterList'
import { moveCursor, renderMenu, selectedItem } from './screens/menu'
import { loadReader, showReaderPage, pagerLabel, type ReaderState } from './screens/reader'
import type { PageSpec } from './screens/types'
import { nonEmptyLabel } from './screens/util'
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

function showBridgeDebug(text: string): void {
  const el = document.getElementById('bridgeDebug')
  if (el) el.textContent = text
}

// Per the page-lifecycle docs: createStartUpPageContainer must be called
// exactly once at startup; every screen transition after that uses
// rebuildPageContainer. Screens are now cursor-driven TEXT menus (see
// screens/menu.ts), so this only fires on entering a screen - moving the
// cursor within a menu is a flicker-free textContainerUpgrade, no rebuild.
let launched = false
async function present(spec: PageSpec): Promise<void> {
  try {
    if (!launched) {
      launched = true
      const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(spec))
      showBridgeDebug(`createStartUpPageContainer -> ${result}`)
      if (result !== 0) console.error('createStartUpPageContainer failed:', result)
    } else {
      const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(spec))
      showBridgeDebug(`rebuildPageContainer -> ${ok}`)
      if (!ok) console.error('rebuildPageContainer failed')
    }
  } catch (err) {
    showBridgeDebug(`present() threw: ${err instanceof Error ? err.message : String(err)}`)
    throw err
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
    // Nothing has ever been shown yet (very first launch failed) - put a
    // readable error on the glasses instead of leaving them blank.
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
// CLICK_EVENT is 0, and JSON serialization drops zero values, so a tap
// arrives as an envelope whose eventType is missing (undefined) rather than
// 0 - see sdk-quirks.md "Quirk 1". Coalesce a present envelope's eventType
// to 0 so taps match; this is why scrolling (1/2) worked but tapping did not.
function envelopeType(env: { eventType?: OsEventTypeList } | undefined): OsEventTypeList | null {
  return env ? (env.eventType ?? OsEventTypeList.CLICK_EVENT) : null
}
function hasEventType(event: EvenHubEvent, type: OsEventTypeList): boolean {
  return (
    envelopeType(event.sysEvent) === type ||
    envelopeType(event.textEvent) === type ||
    envelopeType(event.listEvent) === type
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

  // Menu screens (bookshelf, chapterList): swipe moves the cursor and
  // redraws in place via textContainerUpgrade (no page rebuild); tap selects
  // the cursor item. Scroll/click on a text container arrive via
  // textEvent/sysEvent, so use hasEventType (not event.listEvent).
  if (screen.name === 'bookshelf') {
    const menu = screen.state.menu
    if (hasEventType(event, OsEventTypeList.SCROLL_TOP_EVENT)) {
      if (moveCursor(menu, -1)) renderMenu(bridge, menu).then(mirrorCompanion).catch((err) => console.error(err))
      return
    }
    if (hasEventType(event, OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
      if (moveCursor(menu, 1)) renderMenu(bridge, menu).then(mirrorCompanion).catch((err) => console.error(err))
      return
    }
    if (hasEventType(event, OsEventTypeList.CLICK_EVENT)) {
      const novel = selectedItem(menu)
      if (novel) goToChapterList(novel.id).catch((err) => console.error(err))
      return
    }
  }

  if (screen.name === 'chapterList') {
    const menu = screen.state.menu
    if (hasEventType(event, OsEventTypeList.SCROLL_TOP_EVENT)) {
      if (moveCursor(menu, -1)) renderMenu(bridge, menu).then(mirrorCompanion).catch((err) => console.error(err))
      return
    }
    if (hasEventType(event, OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
      if (moveCursor(menu, 1)) renderMenu(bridge, menu).then(mirrorCompanion).catch((err) => console.error(err))
      return
    }
    if (hasEventType(event, OsEventTypeList.CLICK_EVENT)) {
      const chapter = selectedItem(menu)
      if (chapter) goToReader(screen.state.novelId, chapter.episode).catch((err) => console.error(err))
      return
    }
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
    <div id="bridgeDebug" style="font-size:11px;color:#7B9EFF;margin-bottom:8px;word-break:break-all;"></div>
    <div id="mirror" style="background:#2E2E2E;border:1px solid #3E3E3E;border-radius:12px;padding:20px;font-size:15px;line-height:1.55;color:#E5E5E5;margin:0;"></div>
    <div id="downloadSection" style="display:none;margin-top:12px;flex-direction:column;gap:6px;">
      <button id="downloadSelectedBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">チェックした話をダウンロード</button>
      <button id="downloadAllBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">この小説を全話ダウンロード</button>
      <div id="downloadStatus" style="font-size:12px;color:#919191;"></div>
    </div>
    <footer style="font-size:12px;color:#7B7B7B;text-align:center;margin-top:16px;">
      一覧: スワイプで選択移動 / タップで決定 · リーダー: タップで次ページ / 上スワイプで前 · ダブルタップで戻る
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
      <button id="showFavoritesBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;margin-top:8px;">ハーメルンのお気に入りを見る</button>
      <div id="favoritesPager" style="display:none;justify-content:space-between;align-items:center;position:sticky;top:0;background:#232323;padding:8px 0;z-index:1;">
        <button id="favoritesPrev" style="padding:8px 14px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">← 前へ</button>
        <span id="favoritesPageLabel" style="font-size:12px;color:#919191;"></span>
        <button id="favoritesNext" style="padding:8px 14px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">次へ →</button>
      </div>
      <div id="favoritesList" style="display:flex;flex-direction:column;"></div>
      <button id="manageDownloadsBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;margin-top:8px;">本棚からダウンロード管理</button>
      <div id="novelPickerList" style="display:flex;flex-direction:column;"></div>
      <div id="phoneChapterList" style="display:none;flex-direction:column;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #3E3E3E;">
        <div id="phoneChapterListTitle" style="font-size:13px;font-weight:600;"></div>
        <div id="phoneChapterItems" style="display:flex;flex-direction:column;max-height:240px;overflow-y:auto;"></div>
        <button id="phoneDownloadSelectedBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">チェックした話をダウンロード</button>
        <button id="phoneDownloadAllBtn" style="padding:8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;">この小説を全話ダウンロード</button>
        <div id="phoneDownloadStatus" style="font-size:12px;color:#919191;"></div>
      </div>
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

// --- Favorites browser: browse without importing everything, add one at a
// time. Requires the backend's HAMELN_COOKIE to be configured. ---
let favoritesState: { page: number; totalPages: number; novels: FavoriteNovel[] } | null = null

async function loadFavoritesPage(page: number): Promise<void> {
  const listEl = document.getElementById('favoritesList')
  const pager = document.getElementById('favoritesPager')
  const pageLabel = document.getElementById('favoritesPageLabel')
  if (listEl) listEl.textContent = '読み込み中...'
  try {
    const result = await fetchFavoritesPage(page)
    favoritesState = result
    if (pager) pager.style.display = 'flex'
    if (pageLabel) pageLabel.textContent = `${result.page} / ${result.totalPages}`
    if (listEl) {
      listEl.innerHTML = result.novels
        .map(
          (n, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #3E3E3E;">
          <span style="font-size:13px;">${escapeHtml(n.title)}<br><span style="color:#919191;font-size:11px;">${escapeHtml(n.author)}</span></span>
          <button data-add-index="${i}" style="padding:4px 8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;flex-shrink:0;">追加</button>
        </div>`,
        )
        .join('')
      listEl.querySelectorAll<HTMLButtonElement>('[data-add-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const novel = favoritesState?.novels[Number(btn.dataset.addIndex)]
          if (novel) addFavoriteNovel(novel, btn).catch((err) => console.error(err))
        })
      })
    }
  } catch (err) {
    console.error(err)
    if (listEl) listEl.textContent = '取得に失敗しました（HAMELN_COOKIEの設定を確認してください）'
  }
}

async function addFavoriteNovel(novel: FavoriteNovel, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true
  btn.textContent = '追加中...'
  try {
    await registerNovel(`https://syosetu.org/novel/${novel.id}/`)
    btn.textContent = '追加済み'
    if (screen?.name === 'bookshelf') await goToBookshelf()
  } catch (err) {
    console.error(err)
    btn.textContent = '失敗'
    btn.disabled = false
  }
}

document.getElementById('showFavoritesBtn')?.addEventListener('click', () => {
  loadFavoritesPage(1).catch((err) => console.error(err))
})
document.getElementById('favoritesPrev')?.addEventListener('click', () => {
  if (favoritesState && favoritesState.page > 1) loadFavoritesPage(favoritesState.page - 1).catch((err) => console.error(err))
})
document.getElementById('favoritesNext')?.addEventListener('click', () => {
  if (favoritesState && favoritesState.page < favoritesState.totalPages) {
    loadFavoritesPage(favoritesState.page + 1).catch((err) => console.error(err))
  }
})

// --- Chapter downloads (offline storage) ---
// Sequential on purpose: avoids hammering the backend with many concurrent
// requests when a novel has dozens/hundreds of chapters, and lets the
// status line show real progress instead of an all-or-nothing result.
async function downloadChapters(
  novelId: string,
  chapters: { episode: string }[],
  statusElId = 'downloadStatus',
): Promise<void> {
  const statusEl = document.getElementById(statusElId)
  let saved = 0
  let skipped = 0
  let failed = 0
  for (const chapter of chapters) {
    if (statusEl) statusEl.textContent = `ダウンロード中... ${saved + skipped + failed} / ${chapters.length}`
    if (await isChapterSavedOffline(novelId, chapter.episode)) {
      skipped++
      continue
    }
    try {
      const content = await fetchChapter(novelId, chapter.episode)
      await saveOfflineChapter(novelId, chapter.episode, content)
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

async function refreshChapterListIfShowing(novelId: string): Promise<void> {
  if (screen?.name === 'chapterList' && screen.state.novelId === novelId) {
    await goToChapterList(novelId)
  }
}

document.getElementById('downloadAllBtn')?.addEventListener('click', () => {
  if (!screen || screen.name !== 'chapterList') return
  const novelId = screen.state.novelId
  downloadChapters(novelId, screen.state.chapters)
    .then(() => refreshChapterListIfShowing(novelId))
    .catch((err) => console.error(err))
})

document.getElementById('downloadSelectedBtn')?.addEventListener('click', () => {
  if (!screen || screen.name !== 'chapterList') return
  const checked = Array.from(
    document.querySelectorAll<HTMLInputElement>('#mirror input[type="checkbox"]:checked'),
  )
  const episodes = new Set(checked.map((el) => el.dataset.episode).filter((e): e is string => !!e))
  if (episodes.size === 0) return
  const novelId = screen.state.novelId
  const selected = screen.state.chapters.filter((c) => episodes.has(c.episode))
  downloadChapters(novelId, selected)
    .then(() => refreshChapterListIfShowing(novelId))
    .catch((err) => console.error(err))
})

// --- Phone-only download management: browse any bookshelf novel's chapter
// list and download from it, independent of whatever the glasses are
// currently showing (no need to navigate there on the glasses first). ---
let phoneChapterBrowse: { novelId: string; chapters: ChapterMeta[] } | null = null

async function loadNovelPicker(): Promise<void> {
  const listEl = document.getElementById('novelPickerList')
  if (listEl) listEl.textContent = '読み込み中...'
  try {
    const novels = await fetchNovels()
    if (listEl) {
      listEl.innerHTML = novels
        .map(
          (n, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #3E3E3E;">
          <span style="font-size:13px;">${escapeHtml(nonEmptyLabel(n.title))}</span>
          <button data-novel-index="${i}" style="padding:4px 8px;border-radius:6px;border:none;background:#3E3E3E;color:#E5E5E5;cursor:pointer;flex-shrink:0;">話数を見る</button>
        </div>`,
        )
        .join('')
      listEl.querySelectorAll<HTMLButtonElement>('[data-novel-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const novel = novels[Number(btn.dataset.novelIndex)]
          if (novel) loadPhoneChapterList(novel.id).catch((err) => console.error(err))
        })
      })
    }
  } catch (err) {
    console.error(err)
    if (listEl) listEl.textContent = '取得に失敗しました'
  }
}

async function loadPhoneChapterList(novelId: string): Promise<void> {
  const panel = document.getElementById('phoneChapterList')
  const titleEl = document.getElementById('phoneChapterListTitle')
  const itemsEl = document.getElementById('phoneChapterItems')
  const statusEl = document.getElementById('phoneDownloadStatus')
  try {
    const detail = await fetchNovel(novelId)
    phoneChapterBrowse = { novelId, chapters: detail.chapters }
    const downloaded = await Promise.all(detail.chapters.map((c) => isChapterSavedOffline(novelId, c.episode)))
    if (panel) panel.style.display = 'flex'
    if (titleEl) titleEl.textContent = detail.title
    if (statusEl) statusEl.textContent = ''
    if (itemsEl) {
      itemsEl.innerHTML = detail.chapters
        .map(
          (c, i) => `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <input type="checkbox" data-episode="${escapeHtml(c.episode)}" />
          <span>${escapeHtml(`${downloaded[i] ? DOWNLOADED_MARKER : ''}${c.episode}. ${c.title}`)}</span>
        </label>`,
        )
        .join('')
    }
  } catch (err) {
    console.error(err)
  }
}

document.getElementById('manageDownloadsBtn')?.addEventListener('click', () => {
  loadNovelPicker().catch((err) => console.error(err))
})

document.getElementById('phoneDownloadAllBtn')?.addEventListener('click', () => {
  if (!phoneChapterBrowse) return
  const novelId = phoneChapterBrowse.novelId
  downloadChapters(novelId, phoneChapterBrowse.chapters, 'phoneDownloadStatus')
    .then(() => loadPhoneChapterList(novelId))
    .catch((err) => console.error(err))
})

document.getElementById('phoneDownloadSelectedBtn')?.addEventListener('click', () => {
  if (!phoneChapterBrowse) return
  const checked = Array.from(
    document.querySelectorAll<HTMLInputElement>('#phoneChapterItems input[type="checkbox"]:checked'),
  )
  const episodes = new Set(checked.map((el) => el.dataset.episode).filter((e): e is string => !!e))
  if (episodes.size === 0) return
  const novelId = phoneChapterBrowse.novelId
  const selected = phoneChapterBrowse.chapters.filter((c) => episodes.has(c.episode))
  downloadChapters(novelId, selected, 'phoneDownloadStatus')
    .then(() => loadPhoneChapterList(novelId))
    .catch((err) => console.error(err))
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
    downloadSection.style.display = screen.name === 'chapterList' ? 'flex' : 'none'
  }

  if (screen.name === 'bookshelf') {
    title.textContent = '本棚'
    count.textContent = `${screen.state.novels.length} 冊`
    mirror.innerHTML = listHtml(screen.state.novels.map((n) => nonEmptyLabel(n.title)))
  } else if (screen.name === 'chapterList') {
    const chapterListState = screen.state
    const cursorEpisode = chapterListState.menu.items[chapterListState.menu.cursor]?.value.episode
    title.textContent = chapterListState.novelTitle
    count.textContent = `${chapterListState.chapters.length} 話`
    // Checkboxes here (rather than a read-only list) are what
    // downloadSelectedBtn reads via data-episode when downloading a subset
    // of chapters instead of the whole novel. The glasses cursor is mirrored
    // with a ▶ marker.
    mirror.innerHTML = chapterListState.chapters
      .map((c) => {
        const marker =
          (c.episode === cursorEpisode ? '▶ ' : '') +
          (chapterListState.downloadedEpisodes.has(c.episode) ? DOWNLOADED_MARKER : '')
        return `<label style="display:flex;align-items:center;gap:8px;padding:4px 0;">
          <input type="checkbox" data-episode="${escapeHtml(c.episode)}" />
          <span>${escapeHtml(`${marker}${c.episode}. ${c.title}`)}</span>
        </label>`
      })
      .join('')
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
