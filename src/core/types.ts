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
