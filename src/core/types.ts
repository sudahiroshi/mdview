/** メイン・プリロード・レンダラで共有する型（値を持たないので実行時依存は生まない）。 */

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
}

export interface SaveRequest {
  /** 保存ダイアログの初期ファイル名。 */
  defaultName: string
  /** 初期ディレクトリ（通常は表示中の文書と同じ場所）。 */
  dir?: string
  extensions: string[]
  filterName: string
}
