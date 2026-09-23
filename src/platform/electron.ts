import { assetUrl, isExternalUrl, resolveFromDoc } from '../core/paths.js'
import type { Capabilities, DocPayload, Platform, SaveRequest, Settings } from './types.js'
import type { DocPdfOptions } from '../core/pdf.js'

const capabilities: Capabilities = {
  chooseSaveLocation: true,
  relativeImages: true,
  watch: true,
  directPdf: true
}

/** デスクトップ版。実体はメインプロセスにあり、preload 越しに呼ぶ。 */
export const electronPlatform: Platform = {
  kind: 'electron',
  capabilities,
  limitation: null,

  openDialog: () => window.api.openDialog(),
  openDropped: (file) => window.api.load(window.api.pathForFile(file)),
  loadPath: (path) => window.api.load(path),

  async resolveImage(dir, src) {
    if (isExternalUrl(src)) return src
    return assetUrl(resolveFromDoc(dir, src))
  },

  save: (req: SaveRequest, data) => window.api.save(req, data),
  savePdf: (req, svg, width, height) => window.api.savePdf(req, svg, width, height),
  saveDocumentPdf: (req, html, options: DocPdfOptions) => window.api.saveDocumentPdf(req, html, options),
  copyText: (text) => window.api.copyText(text),

  getSettings: (): Promise<Settings> => window.api.getSettings(),
  setSettings: (patch) => window.api.setSettings(patch),

  onDocOpened: (cb: (doc: DocPayload) => void) => window.api.onDocOpened(cb),
  onDocChanged: (cb: (doc: DocPayload) => void) => window.api.onDocChanged(cb),
  onRequestDocPdf: (cb) => window.api.onRequestDocPdf(cb)
}
