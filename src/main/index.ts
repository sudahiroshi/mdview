import { app, shell, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, join, dirname } from 'node:path'
import { DocWatcher } from './watcher.js'
import { registerAssetScheme, handleAssetScheme, setAssetRoot, clearAssetRoot } from './assets.js'
import * as settings from './settings.js'
import { saveWithDialog, copyText, svgToPdf, documentToPdf, type SaveRequest, type RendererTarget } from './export.js'
import type { DocPdfOptions } from '../core/pdf.js'
import type { DocPayload } from '../core/types.js'

/** ウインドウ 1 枚ぶんの状態。文書も監視もウインドウごとに持つ。 */
interface DocWindow {
  readonly win: BrowserWindow
  readonly id: number
  path: string | null
  readonly watcher: DocWatcher
}

const windows = new Map<number, DocWindow>()

/** ready より先に open-file が来ることがあるので溜めておく（Finder からの起動対策）。 */
const pendingOpen: string[] = []

/** 新しいウインドウを少しずらして重ねる量。 */
const CASCADE = 28

/* ---------------- ウインドウの取り回し ---------------- */

function entryOf(win: BrowserWindow | null): DocWindow | null {
  return win ? (windows.get(win.webContents.id) ?? null) : null
}

function focusedEntry(): DocWindow | null {
  return entryOf(BrowserWindow.getFocusedWindow()) ?? [...windows.values()][0] ?? null
}

function senderEntry(event: Electron.IpcMainInvokeEvent): DocWindow | null {
  return windows.get(event.sender.id) ?? null
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return senderEntry(event)?.win ?? BrowserWindow.getFocusedWindow() ?? null
}

/** 2 枚目以降は、いま見ているウインドウから少しずらして出す。 */
function boundsForNew(): Electron.Rectangle | { width: number; height: number } {
  const base = settings.load().window
  const from = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().at(-1)
  if (!from) return base
  const b = from.getNormalBounds()
  return { width: b.width, height: b.height, x: b.x + CASCADE, y: b.y + CASCADE }
}

/** レンダラの読み込みが済むまで待ってから返す（開いた直後に文書を送れるように）。 */
function createWindow(): Promise<DocWindow> {
  const s = settings.load()
  const win = new BrowserWindow({
    ...boundsForNew(),
    minWidth: 640,
    minHeight: 480,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: s.theme === 'dark' ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const id = win.webContents.id
  const entry: DocWindow = {
    win,
    id,
    path: null,
    watcher: new DocWatcher(async (path) => {
      if (path !== entry.path || win.isDestroyed()) return
      try {
        win.webContents.send('doc:changed', await readDoc(path))
      } catch (e) {
        console.error('再読み込みに失敗:', e)
      }
    })
  }
  windows.set(id, entry)

  win.on('ready-to-show', () => win.show())

  // 外部リンクは既定ブラウザへ逃がし、アプリ内ではナビゲートさせない
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 次に開くウインドウの既定の大きさとして覚える
  const persistBounds = (): void => {
    if (win.isDestroyed() || win.isFullScreen()) return
    settings.save({ window: win.getNormalBounds() })
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)

  win.on('closed', () => {
    entry.watcher.close()
    clearAssetRoot(id)
    windows.delete(id)
    // 同名だった相手が閉じたら、残ったほうは親フォルダ名を外して短くする
    refreshTitles()
    buildMenu()
  })

  const target = rendererTarget()
  const ready = new Promise<DocWindow>((resolve) => {
    win.webContents.once('did-finish-load', () => resolve(entry))
  })
  if (target.url) void win.loadURL(target.url)
  else void win.loadFile(target.file as string)
  buildMenu()
  return ready
}

/* ---------------- 文書を開く ---------------- */

async function readDoc(path: string): Promise<DocPayload> {
  const [content, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { path, dir: dirname(path), content, mtimeMs: st.mtimeMs }
}

/**
 * ウインドウの題を付け直す。
 * 同じ名前のファイル（docs/README.md をいくつも開くなど）を複数のウインドウで
 * 開いたときは、親フォルダ名を添えて見分けられるようにする。
 */
function refreshTitles(): void {
  const seen = new Map<string, number>()
  for (const entry of windows.values()) {
    if (entry.path) seen.set(basename(entry.path), (seen.get(basename(entry.path)) ?? 0) + 1)
  }
  for (const entry of windows.values()) {
    if (entry.win.isDestroyed()) continue
    const name = entry.path ? basename(entry.path) : null
    const label =
      name === null
        ? 'mdview'
        : (seen.get(name) ?? 0) > 1
          ? `${name} — ${basename(dirname(entry.path as string))} — mdview`
          : `${name} — mdview`
    // ウインドウの題は document.title に追従するので、レンダラに設定させる。
    // ここで setTitle しても、次の描画で上書きされてしまう。
    entry.win.webContents.send('ui:title', label)
  }
}

async function openDoc(entry: DocWindow, path: string): Promise<DocPayload> {
  const doc = await readDoc(path)
  entry.path = path
  setAssetRoot(entry.id, doc.dir)
  entry.watcher.watchFile(path)
  settings.pushRecent(path)
  app.addRecentDocument(path)
  entry.win.setRepresentedFilename(path)
  refreshTitles()
  buildMenu()
  return doc
}

/** メニューや Finder など、レンダラ以外を起点に開くときの共通経路。 */
async function openInWindow(entry: DocWindow, path: string): Promise<void> {
  try {
    entry.win.webContents.send('doc:opened', await openDoc(entry, path))
  } catch (e) {
    settings.removeRecent(path)
    buildMenu()
    dialog.showErrorBox('開けません', `${path}\n\n${(e as Error).message}`)
  }
}

/**
 * 空いているウインドウがあればそこに、無ければ新しいウインドウに開く。
 *
 * すでに何か表示しているウインドウを黙って置き換えると、読んでいたものを見失う。
 * 置き換えたいときは、そのウインドウへドラッグ＆ドロップしてもらう。
 */
async function openSomewhere(path: string): Promise<void> {
  const focused = focusedEntry()
  const empty = focused?.path === null ? focused : [...windows.values()].find((w) => w.path === null)
  await openInWindow(empty ?? (await createWindow()), path)
}

async function showOpenDialog(parent: BrowserWindow | null): Promise<string | null> {
  const r = await dialog.showOpenDialog(parent ?? (undefined as unknown as BrowserWindow), {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]
  })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
}

/* ---------------- メニュー ---------------- */

function buildMenu(): void {
  const recent = settings.load().recentFiles
  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? [
        ...recent.map((p) => ({ label: p.replace(app.getPath('home'), '~'), click: () => void openSomewhere(p) })),
        { type: 'separator' as const },
        {
          label: '履歴を消去',
          click: () => {
            settings.save({ recentFiles: [] })
            buildMenu()
          }
        }
      ]
    : [{ label: '（なし）', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'ファイル',
      submenu: [
        { label: '新規ウインドウ', accelerator: 'CmdOrCtrl+N', click: () => void createWindow() },
        { type: 'separator' },
        {
          label: '開く…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            void showOpenDialog(BrowserWindow.getFocusedWindow()).then((p) => {
              if (p) void openSomewhere(p)
            })
          }
        },
        { label: '最近使った文書', submenu: recentItems },
        { type: 'separator' },
        {
          label: '文書全体を PDF に書き出し…',
          accelerator: 'CmdOrCtrl+P',
          click: () => focusedEntry()?.win.webContents.send('ui:doc-pdf')
        },
        { type: 'separator' },
        {
          label: '再読み込み',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const entry = focusedEntry()
            if (entry?.path) void openInWindow(entry, entry.path)
          }
        },
        { type: 'separator' },
        { role: 'close', label: 'ウインドウを閉じる' }
      ]
    },
    { role: 'editMenu' },
    {
      label: '表示',
      submenu: [
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン' },
        { role: 'toggleDevTools', label: '開発者ツール' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** レンダラの場所。印刷用の隠しウインドウでも同じものを読ませる。 */
function rendererTarget(): RendererTarget {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return {
    ...(devUrl ? { url: devUrl } : { file: join(import.meta.dirname, '../renderer/index.html') }),
    preload: join(import.meta.dirname, '../preload/index.cjs')
  }
}

/* ---------------- 起動 ---------------- */

// 開発時の動作検証用。MDVIEW_DEBUG_PORT を付けて起動すると DevTools Protocol で
// 描画結果を外部から検査できる（本番ビルドでは環境変数が無いので無効）。
if (process.env['MDVIEW_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['MDVIEW_DEBUG_PORT'])
}

registerAssetScheme()

// Finder で .md をダブルクリックして起動した場合、ready より先にこのイベントが来ることがある。
// ウインドウが 1 枚も無い状態（macOS では全部閉じてもアプリは残る）でも、
// openSomewhere が新しいウインドウを開くので、ready 済みなら常にそちらへ渡す。
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (app.isReady()) void openSomewhere(path)
  else pendingOpen.push(path)
})

app.whenReady().then(async () => {
  handleAssetScheme()

  ipcMain.handle('win:id', (e) => e.sender.id)

  // 開く先はメニューと同じ決まり（空のウインドウがあればそこ、無ければ新規）。
  // 別のウインドウで開く場合があるので、文書は doc:opened で届ける。
  ipcMain.handle('doc:open-dialog', async (e) => {
    const path = await showOpenDialog(senderWindow(e))
    if (!path) return null
    await openSomewhere(path)
    return null
  })

  ipcMain.handle('doc:load', async (e, path: string) => {
    const entry = senderEntry(e)
    if (!entry) throw new Error('ウインドウが見つかりません')
    return openDoc(entry, path)
  })

  ipcMain.handle('export:save', (e, req: SaveRequest, data: Uint8Array | string) =>
    saveWithDialog(senderWindow(e), req, data)
  )
  ipcMain.handle('export:pdf', async (e, req: SaveRequest, svg: string, w: number, h: number) => {
    const pdf = await svgToPdf(svg, w, h)
    return saveWithDialog(senderWindow(e), req, pdf)
  })
  ipcMain.handle('export:copy', (_e, text: string) => copyText(text))
  ipcMain.handle('export:doc-pdf', async (e, req: SaveRequest, html: string, opts: DocPdfOptions) => {
    const pdf = await documentToPdf(rendererTarget(), html, opts)
    return saveWithDialog(senderWindow(e), req, pdf)
  })

  // 動作検証用。保存ダイアログを挟まずに PDF のバイト列を取り出す。
  // デバッグポートを開いているときだけ登録する。
  if (process.env['MDVIEW_DEBUG_PORT']) {
    ipcMain.handle('debug:pdf-bytes', (_e, svg: string, w: number, h: number) => svgToPdf(svg, w, h))
    ipcMain.handle('debug:doc-pdf-bytes', (_e, html: string, opts: DocPdfOptions) =>
      documentToPdf(rendererTarget(), html, opts)
    )
  }

  ipcMain.handle('settings:get', () => settings.load())
  ipcMain.handle('settings:set', (e, patch: Partial<settings.Settings>) => {
    const next = settings.save(patch)
    // 設定はアプリ全体で 1 つなので、他のウインドウにも伝えて描き直させる。
    // 伝えないと、片方で番号モードを変えてももう片方が古い表示のまま残る。
    for (const entry of windows.values()) {
      if (entry.id !== e.sender.id) entry.win.webContents.send('settings:changed', next)
    }
    return next
  })

  const first = await createWindow()

  const initial = [
    ...pendingOpen,
    ...process.argv.slice(1).filter((a) => /\.(md|markdown|mdown|mkd)$/i.test(a))
  ]
  pendingOpen.length = 0
  if (initial.length > 0) {
    await openInWindow(first, initial[0])
    for (const path of initial.slice(1)) await openSomewhere(path)
  }

  app.on('activate', () => {
    if (windows.size === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
