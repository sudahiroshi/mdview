import { isExternalUrl } from '../core/paths.js'
import { mergeSettings } from '../core/settings.js'
import { printDocument, printFigure } from './web-print.js'
import type { Capabilities, DocPayload, Platform, SaveRequest, Settings } from './types.js'
import type { DocPdfOptions } from '../core/pdf.js'

const SETTINGS_KEY = 'mdview.settings'
const WATCH_INTERVAL_MS = 800

type Picker = (options?: unknown) => Promise<FileSystemFileHandle[]>
type DirPicker = (options?: unknown) => Promise<FileSystemDirectoryHandle>
type SavePicker = (options?: unknown) => Promise<FileSystemFileHandle>

const win = window as unknown as {
  showOpenFilePicker?: Picker
  showDirectoryPicker?: DirPicker
  showSaveFilePicker?: SavePicker
}

const hasOpenPicker = typeof win.showOpenFilePicker === 'function'
const hasDirPicker = typeof win.showDirectoryPicker === 'function'
const hasSavePicker = typeof win.showSaveFilePicker === 'function'

const capabilities: Capabilities = {
  chooseSaveLocation: hasSavePicker,
  relativeImages: hasDirPicker,
  watch: hasOpenPicker,
  directPdf: false
}

/* ---------------- 状態 ---------------- */

let fileHandle: FileSystemFileHandle | null = null
/** 画像を読むために許可をもらったフォルダ。 */
let assetDir: FileSystemDirectoryHandle | null = null
let lastModified = 0
let watchTimer: number | null = null

const changedHandlers = new Set<(doc: DocPayload) => void>()
const openedHandlers = new Set<(doc: DocPayload) => void>()
const docPdfHandlers = new Set<() => void>()

/** 画像 1 つにつき objectURL を 1 本作る。文書を替えるときにまとめて捨てる。 */
const imageUrls = new Map<string, string>()

function releaseImages(): void {
  for (const url of imageUrls.values()) URL.revokeObjectURL(url)
  imageUrls.clear()
}

async function toPayload(file: File): Promise<DocPayload> {
  releaseImages()
  lastModified = file.lastModified
  return { path: file.name, dir: '', content: await file.text(), mtimeMs: file.lastModified }
}

/* ---------------- 監視 ---------------- */

function stopWatch(): void {
  if (watchTimer !== null) clearInterval(watchTimer)
  watchTimer = null
}

/**
 * ブラウザにはファイル監視の API が無いので、更新時刻を定期的に見に行く。
 * 権限が外れたときは静かに監視をやめる。
 */
function startWatch(): void {
  stopWatch()
  if (!fileHandle) return
  watchTimer = window.setInterval(() => {
    void (async () => {
      try {
        const file = await fileHandle!.getFile()
        if (file.lastModified === lastModified) return
        const doc = await toPayload(file)
        for (const cb of changedHandlers) cb(doc)
      } catch {
        stopWatch()
      }
    })()
  }, WATCH_INTERVAL_MS)
}

/* ---------------- ファイルを開く ---------------- */

const MD_TYPES = [
  { description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'] } }
]

/** File System Access API が無いブラウザ向けの入口。 */
function pickViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdown,.mkd,text/markdown,text/plain'
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.click()
  })
}

async function openDialog(): Promise<DocPayload | null> {
  if (hasOpenPicker) {
    try {
      const [handle] = await win.showOpenFilePicker!({ types: MD_TYPES, multiple: false })
      if (!handle) return null
      fileHandle = handle
      const doc = await toPayload(await handle.getFile())
      startWatch()
      return doc
    } catch {
      return null // 取り消し
    }
  }
  const file = await pickViaInput()
  if (!file) return null
  fileHandle = null
  stopWatch()
  return toPayload(file)
}

async function openDropped(file: File): Promise<DocPayload | null> {
  fileHandle = null
  stopWatch()
  return toPayload(file)
}

/** 画像のあるフォルダを許可してもらう。ブラウザ版だけの入口。 */
export async function grantAssetFolder(): Promise<boolean> {
  if (!hasDirPicker) return false
  try {
    assetDir = await win.showDirectoryPicker!({ mode: 'read' })
    releaseImages()
    return true
  } catch {
    return false
  }
}

async function resolveImage(_dir: string, src: string): Promise<string | null> {
  if (isExternalUrl(src)) return src
  const cached = imageUrls.get(src)
  if (cached) return cached
  if (!assetDir) return null

  const parts = src.split('/').filter((p) => p && p !== '.')
  // 許可をもらったフォルダの外には出られない
  if (parts.includes('..') || parts.length === 0) return null

  try {
    let dir = assetDir
    for (const name of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(name)
    const handle = await dir.getFileHandle(parts[parts.length - 1])
    const url = URL.createObjectURL(await handle.getFile())
    imageUrls.set(src, url)
    return url
  } catch {
    return null
  }
}

/* ---------------- 保存 ---------------- */

const MIME: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  tex: 'text/x-tex'
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function save(req: SaveRequest, data: Uint8Array | string): Promise<string | null> {
  const type = MIME[req.extensions[0]] ?? 'application/octet-stream'
  const blob = new Blob([data as BlobPart], { type })

  if (hasSavePicker) {
    try {
      const handle = await win.showSaveFilePicker!({
        suggestedName: req.defaultName,
        types: [{ description: req.filterName, accept: { [type]: req.extensions.map((e) => `.${e}`) } }]
      })
      const writable = await (handle as unknown as { createWritable(): Promise<WritableStream> }).createWritable()
      const writer = writable.getWriter()
      await writer.write(blob)
      await writer.close()
      return handle.name
    } catch {
      return null // 取り消し
    }
  }

  download(req.defaultName, blob)
  return req.defaultName
}

/**
 * ブラウザには PDF をその場で作る API が無い。印刷ダイアログを開いて
 * 「PDF として保存」を選んでもらう。保存先はこちらでは分からないので null を返す。
 */
async function savePdf(_req: SaveRequest, svg: string, width: number, height: number): Promise<string | null> {
  await printFigure(svg, width, height, true)
  return null
}

async function saveDocumentPdf(_req: SaveRequest, html: string, options: DocPdfOptions): Promise<string | null> {
  await printDocument(html, options)
  return null
}

/* ---------------- 設定 ---------------- */

async function getSettings(): Promise<Settings> {
  try {
    return mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings>)
  } catch {
    return mergeSettings(null)
  }
}

async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // 容量超過やプライベートモードでは諦める（表示は続けられる）
  }
  return next
}

/* ---------------- 公開 ---------------- */

function subscribe<T>(set: Set<T>, cb: T): () => void {
  set.add(cb)
  return () => set.delete(cb)
}

function limitation(): string | null {
  if (!hasOpenPicker) {
    return 'このブラウザではファイルを直接扱えません。相対パスの画像と自動リロードは使えず、保存はダウンロードになります。Chrome か Edge を使うと全機能が動きます。'
  }
  return null
}

export const webPlatform: Platform & { grantAssetFolder(): Promise<boolean> } = {
  kind: 'web',
  capabilities,
  limitation: limitation(),

  openDialog,
  openDropped,
  grantAssetFolder,
  resolveImage,
  save,
  savePdf,
  saveDocumentPdf,
  copyText: (text) => navigator.clipboard.writeText(text),
  getSettings,
  setSettings,

  onDocOpened: (cb) => subscribe(openedHandlers, cb),
  onDocChanged: (cb) => subscribe(changedHandlers, cb),
  onRequestDocPdf: (cb) => subscribe(docPdfHandlers, cb)
}

/** キーボード操作など、アプリ側から PDF 書き出しを促すとき。 */
export function requestDocPdf(): void {
  for (const cb of docPdfHandlers) cb()
}
