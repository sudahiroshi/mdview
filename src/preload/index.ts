import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DocPayload, Settings } from '../core/types.js'

const api = {
  openDialog: (): Promise<DocPayload | null> => ipcRenderer.invoke('doc:open-dialog'),
  load: (path: string): Promise<DocPayload> => ipcRenderer.invoke('doc:load', path),

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
