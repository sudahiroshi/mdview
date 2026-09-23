import { app, shell, BrowserWindow, ipcMain, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { DocWatcher } from './watcher.js'
import { registerAssetScheme, handleAssetScheme, setAssetRoot } from './assets.js'
import * as settings from './settings.js'
import { renderPlantUml } from './plantuml.js'

import type { DocPayload } from '../core/types.js'

let win: BrowserWindow | null = null
let currentDoc: string | null = null
/** ready 前に open-file で渡されたパスを保持する（Finder からの起動対策）。 */
let pendingOpen: string | null = null

const watcher = new DocWatcher(async (path) => {
  if (path !== currentDoc || !win) return
  try {
    win.webContents.send('doc:changed', await readDoc(path))
  } catch (e) {
    console.error('再読み込みに失敗:', e)
  }
})

async function readDoc(path: string): Promise<DocPayload> {
  const [content, st] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { path, dir: dirname(path), content, mtimeMs: st.mtimeMs }
}

async function openDoc(path: string): Promise<DocPayload> {
  const doc = await readDoc(path)
  currentDoc = path
  setAssetRoot(doc.dir)
  watcher.watchFile(path)
  settings.pushRecent(path)
  app.addRecentDocument(path)
  win?.setRepresentedFilename(path)
  win?.setTitle(`${path.split('/').pop()} — mdview`)
  buildMenu()
  return doc
}

/** メニューやドロップなど、レンダラ以外を起点に文書を開くときの共通経路。 */
async function openDocInWindow(path: string): Promise<void> {
  if (!win) return
  try {
    win.webContents.send('doc:opened', await openDoc(path))
  } catch (e) {
    settings.removeRecent(path)
    buildMenu()
    dialog.showErrorBox('開けません', `${path}\n\n${(e as Error).message}`)
  }
}

async function showOpenDialog(): Promise<DocPayload | null> {
  const r = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] }]
  })
  if (r.canceled || r.filePaths.length === 0) return null
  return openDoc(r.filePaths[0])
}

function buildMenu(): void {
  const recent = settings.load().recentFiles
  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? [
        ...recent.map((p) => ({ label: p.replace(app.getPath('home'), '~'), click: () => void openDocInWindow(p) })),
        { type: 'separator' as const },
        { label: '履歴を消去', click: () => { settings.save({ recentFiles: [] }); buildMenu() } }
      ]
    : [{ label: '（なし）', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'ファイル',
      submenu: [
        { label: '開く…', accelerator: 'CmdOrCtrl+O', click: () => void showOpenDialog().then((d) => d && win?.webContents.send('doc:opened', d)) },
        { label: '最近使った文書', submenu: recentItems },
        { type: 'separator' },
        { label: '再読み込み', accelerator: 'CmdOrCtrl+R', click: () => currentDoc && void openDocInWindow(currentDoc) },
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

function createWindow(): void {
  const s = settings.load()
  win = new BrowserWindow({
    ...s.window,
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

  win.on('ready-to-show', () => win?.show())

  // 外部リンクは既定ブラウザへ逃がし、アプリ内ではナビゲートさせない
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const persistBounds = (): void => {
    if (!win || win.isDestroyed() || win.isFullScreen()) return
    settings.save({ window: win.getNormalBounds() })
  }
  win.on('resized', persistBounds)
  win.on('moved', persistBounds)
  win.on('closed', () => { win = null; watcher.close() })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

// 開発時の動作検証用。MDVIEW_DEBUG_PORT を付けて起動すると DevTools Protocol で
// 描画結果を外部から検査できる（本番ビルドでは環境変数が無いので無効）。
if (process.env['MDVIEW_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['MDVIEW_DEBUG_PORT'])
}

registerAssetScheme()

// Finder で .md をダブルクリックして起動した場合、ready より先にこのイベントが来ることがある
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (win) void openDocInWindow(path)
  else pendingOpen = path
})

app.whenReady().then(() => {
  handleAssetScheme()

  ipcMain.handle('doc:open-dialog', () => showOpenDialog())
  ipcMain.handle('doc:load', (_e, path: string) => openDoc(path))
  ipcMain.handle('diagram:plantuml', (_e, code: string) => renderPlantUml(code))
  ipcMain.handle('settings:get', () => settings.load())
  ipcMain.handle('settings:set', (_e, patch: Partial<settings.Settings>) => {
    const next = settings.save(patch)
    return next
  })

  buildMenu()
  createWindow()

  win?.webContents.once('did-finish-load', () => {
    const initial = pendingOpen ?? process.argv.slice(1).find((a) => /\.(md|markdown|mdown|mkd)$/i.test(a))
    pendingOpen = null
    if (initial) void openDocInWindow(initial)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
