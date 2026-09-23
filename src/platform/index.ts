import { electronPlatform } from './electron.js'
import { webPlatform } from './web.js'
import type { Platform } from './types.js'

export type { Capabilities, Platform } from './types.js'

/**
 * 実行環境を見て実装を選ぶ。
 * preload が差し込む window.api があればデスクトップ版。
 */
export const platform: Platform = 'api' in window ? electronPlatform : webPlatform

/** ブラウザ版だけが持つ「画像フォルダの許可」。無い環境では null。 */
export function assetFolderGrant(): (() => Promise<boolean>) | null {
  const fn = (platform as Partial<{ grantAssetFolder(): Promise<boolean> }>).grantAssetFolder
  return typeof fn === 'function' ? fn.bind(platform) : null
}
