import { app, BrowserWindow, dialog, clipboard, type BaseWindow } from 'electron'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const CSS_DPI = 96

import type { SaveRequest } from '../core/types.js'

export type { SaveRequest }

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
