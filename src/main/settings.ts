import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

import type { Settings } from '../core/types.js'

export type { Settings }

const DEFAULTS: Settings = {
  numberMode: 'full',
  numberStyle: 'ja',
  theme: 'system',
  recentFiles: [],
  window: { width: 1200, height: 860 }
}

const MAX_RECENT = 15

let cache: Settings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function load(): Settings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>
    // 設定ファイルは手で壊されうるので、既定値の上に浅くマージして欠損キーを埋める
    cache = { ...DEFAULTS, ...raw, window: { ...DEFAULTS.window, ...raw.window } }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function save(patch: Partial<Settings>): Settings {
  const next = { ...load(), ...patch }
  cache = next
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (e) {
    console.error('設定の保存に失敗:', e)
  }
  return next
}

export function pushRecent(path: string): void {
  const recent = load().recentFiles.filter((p) => p !== path)
  recent.unshift(path)
  save({ recentFiles: recent.slice(0, MAX_RECENT) })
}

export function removeRecent(path: string): void {
  save({ recentFiles: load().recentFiles.filter((p) => p !== path) })
}
