import { app, BrowserWindow, dialog, clipboard, type BaseWindow } from 'electron'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const CSS_DPI = 96

import type { SaveRequest } from '../core/types.js'
import { buildTemplates, marginsInInches, pageSizeFor, type DocPdfOptions } from '../core/pdf.js'

export type { SaveRequest }

/** 印刷用ウインドウに読ませるレンダラの場所（開発時は dev サーバ、配布時はファイル）。 */
export interface RendererTarget {
  url?: string
  file?: string
  preload: string
}

/** 保存先を尋ねて書き出す。取り消されたら null を返す。 */
export async function saveWithDialog(
  parent: BrowserWindow | null,
  req: SaveRequest,
  data: Uint8Array | string
): Promise<string | null> {
  const r = await dialog.showSaveDialog(parent ?? (undefined as unknown as BaseWindow), {
    defaultPath: req.dir ? join(req.dir, req.defaultName) : req.defaultName,
    filters: [{ name: req.filterName, extensions: req.extensions }]
  })
  if (r.canceled || !r.filePath) return null
  await writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data))
  return r.filePath
}

export function copyText(text: string): void {
  clipboard.writeText(text)
}

/**
 * SVG 1 枚を、その実寸ちょうどの 1 ページ PDF にする。
 *
 * jsPDF などで SVG を解釈させるのではなく Chromium の印刷経路を使うのは、
 * 日本語を含むフォントの埋め込みをブラウザ側に任せられ、ベクターのまま出せるため。
 */
export async function svgToPdf(svg: string, widthPx: number, heightPx: number): Promise<Buffer> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; background: #fff; }
    svg { display: block; width: ${widthPx}px; height: ${heightPx}px; }
  </style></head><body>${svg}</body></html>`

  // data: URL だと長さ制限や文字化けの懸念があるため一時ファイルを経由する
  const tmp = join(app.getPath('temp'), `mdview-export-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  await writeFile(tmp, html, 'utf8')

  const win = new BrowserWindow({
    show: false,
    width: Math.max(1, Math.ceil(widthPx)),
    height: Math.max(1, Math.ceil(heightPx)),
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, javascript: false }
  })

  try {
    await win.loadFile(tmp)
    return await win.webContents.printToPDF({
      // printToPDF のページ寸法はインチ指定。CSS ピクセルは 96dpi 換算で渡す
      pageSize: { width: widthPx / CSS_DPI, height: heightPx / CSS_DPI },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: false
    })
  } finally {
    win.destroy()
    await unlink(tmp).catch(() => undefined)
  }
}

/** 印刷時だけ効かせる上書き。画面用の配色や高さ制限をここで打ち消す。 */
const PRINT_CSS = `
  :root, :root[data-theme='dark'] {
    --bg: #ffffff; --fg: #1b1b1f; --muted: #5a5a66; --border: #d7d9e0;
    --surface: #f5f6f9; --accent: #2f4bd1; --code-bg: #f2f3f7;
    color-scheme: light;
  }
  html, body { margin: 0; padding: 0; height: auto; overflow: visible; background: #fff; }
  .doc { max-width: none; margin: 0; font-size: 10.5pt; line-height: 1.75; }
  .doc figure, .doc table, .doc pre, .diagram-body { break-inside: avoid; }
  .doc h1, .doc h2, .doc h3, .doc h4, .doc h5, .doc h6 { break-after: avoid; }
  .doc img, .diagram-body svg { max-width: 100%; }
  .export-bar, .popup-menu, .toast { display: none !important; }
`

/**
 * 文書全体を PDF にする。
 *
 * 画面のウインドウをそのまま印刷すると、ツールバーや、本文をスクロールさせている
 * 入れ物ごと印刷されてページ送りが壊れる。そこで同じレンダラをもう一枚だけ隠しで
 * 開き、本文だけを流し込んでから印刷する。同じ URL なので KaTeX のフォントや
 * mdv-asset の画像もそのまま解決できる。
 */
export async function documentToPdf(target: RendererTarget, bodyHtml: string, opts: DocPdfOptions): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    webPreferences: { preload: target.preload, contextIsolation: true, nodeIntegration: false, sandbox: true }
  })

  try {
    if (target.url) await win.loadURL(target.url)
    else await win.loadFile(target.file as string)

    await win.webContents.executeJavaScript(`(async () => {
      document.documentElement.dataset.theme = 'light'
      document.title = ${JSON.stringify(opts.title || 'document')}
      const style = document.createElement('style')
      style.textContent = ${JSON.stringify(PRINT_CSS)}
      document.head.append(style)

      const root = document.createElement('div')
      root.id = 'print-root'
      root.innerHTML = ${JSON.stringify(bodyHtml)}
      document.body.replaceChildren(root)

      await document.fonts.ready
      await Promise.all([...root.querySelectorAll('img')].map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })
      ))
      // 画像とフォントが入った後の再レイアウトを待つ
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return root.scrollHeight
    })()`)

    const { headerTemplate, footerTemplate, displayHeaderFooter } = buildTemplates(opts)
    return await win.webContents.printToPDF({
      pageSize: pageSizeFor(opts),
      margins: marginsInInches(opts),
      printBackground: true,
      displayHeaderFooter,
      headerTemplate,
      footerTemplate,
      preferCSSPageSize: false
    })
  } finally {
    win.destroy()
  }
}
