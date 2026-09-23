import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DocPayload, Settings, SaveRequest } from '../core/types.js'

const api = {
  openDialog: (): Promise<DocPayload | null> => ipcRenderer.invoke('doc:open-dialog'),
  load: (path: string): Promise<DocPayload> => ipcRenderer.invoke('doc:load', path),

  renderPlantUml: (code: string): Promise<string> => ipcRenderer.invoke('diagram:plantuml', code),

  /** 保存ダイアログを出してファイルへ書き出す。取り消されたら null。 */
  save: (req: SaveRequest, data: Uint8Array | string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', req, data),
  /** SVG を実寸ちょうどの 1 ページ PDF にして保存する。 */
  savePdf: (req: SaveRequest, svg: string, width: number, height: number): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', req, svg, width, height),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('export:copy', text),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),

  /** ドロップされた File から絶対パスを得る（Electron 32 以降 File.path は廃止）。 */
  pathForFile: (f: File): string => webUtils.getPathForFile(f),

  onDocOpened: (cb: (doc: DocPayload) => void): (() => void) => {
    const h = (_e: unknown, doc: DocPayload): void => cb(doc)
    ipcRenderer.on('doc:opened', h)
    return () => ipcRenderer.off('doc:opened', h)
  },
  onDocChanged: (cb: (doc: DocPayload) => void): (() => void) => {
    const h = (_e: unknown, doc: DocPayload): void => cb(doc)
    ipcRenderer.on('doc:changed', h)
    return () => ipcRenderer.off('doc:changed', h)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)

// 動作検証用の窓口。デバッグポートを開いて起動したときだけ生える。
if (process.env['MDVIEW_DEBUG_PORT']) {
  contextBridge.exposeInMainWorld('debugApi', {
    pdfBytes: (svg: string, w: number, h: number): Promise<Uint8Array> =>
      ipcRenderer.invoke('debug:pdf-bytes', svg, w, h)
  })
}
