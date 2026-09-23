import { DOC_PDF_DEFAULTS } from './pdf.js'
import type { Settings } from './types.js'

/** 実行環境によらない設定の既定値。Electron 版もブラウザ版もここを使う。 */
export const DEFAULT_SETTINGS: Settings = {
  numberMode: 'full',
  numberStyle: 'ja',
  theme: 'system',
  recentFiles: [],
  window: { width: 1200, height: 860 },
  docPdf: (({ title: _title, ...rest }) => rest)(DOC_PDF_DEFAULTS),
  exportTransparent: false
}

/** 保存された設定は手で壊されうるので、既定値の上に重ねて欠損を埋める。 */
export function mergeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(raw ?? {}),
    window: { ...DEFAULT_SETTINGS.window, ...raw?.window },
    docPdf: { ...DEFAULT_SETTINGS.docPdf, ...raw?.docPdf }
  }
}
