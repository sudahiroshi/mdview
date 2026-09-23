/** メイン・プリロード・レンダラで共有する型（値を持たないので実行時依存は生まない）。 */

import type { DocPdfOptions } from './pdf.js'

/** 文書全体の PDF 設定のうち、文書ごとに変わる title を除いて永続化する分。 */
export type DocPdfSettings = Omit<DocPdfOptions, 'title'>

export interface DocPayload {
  path: string
  dir: string
  content: string
  mtimeMs: number
}

export type NumberMode = 'none' | 'headings' | 'full'
export type NumberStyle = 'ja' | 'en'
export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  numberMode: NumberMode
  numberStyle: NumberStyle
  theme: Theme
  recentFiles: string[]
  window: { width: number; height: number; x?: number; y?: number }
  docPdf: DocPdfSettings
  /** PNG 書き出しの背景を透過にするか。倍率は都度選ぶ。 */
  pngTransparent: boolean
}

export interface SaveRequest {
  /** 保存ダイアログの初期ファイル名。 */
  defaultName: string
  /** 初期ディレクトリ（通常は表示中の文書と同じ場所）。 */
  dir?: string
  extensions: string[]
  filterName: string
}
