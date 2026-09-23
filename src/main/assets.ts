import { protocol, net } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const ASSET_SCHEME = 'mdv-asset'

/** 参照を許可するディレクトリ（表示中の .md があるディレクトリ）。 */
let allowedRoot: string | null = null

export function setAssetRoot(dir: string | null): void {
  allowedRoot = dir ? resolve(dir) : null
}

/** 絶対パスをレンダラから読める URL へ変換する。 */
export function assetUrl(absPath: string): string {
  return `${ASSET_SCHEME}://local/${encodeURIComponent(absPath)}`
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
  ])
}

export function handleAssetScheme(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      const raw = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
      const abs = resolve(raw)
      // 表示中の文書があるディレクトリの外は読ませない（意図しないファイル読み出しの防止）
      if (!allowedRoot || !(abs === allowedRoot || abs.startsWith(allowedRoot + sep))) {
        return new Response('forbidden', { status: 403 })
      }
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
