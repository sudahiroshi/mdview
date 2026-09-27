import { protocol, net } from 'electron'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const ASSET_SCHEME = 'mdv-asset'

/**
 * ウインドウごとの「参照を許可するディレクトリ」。
 *
 * 配信要求からは要求元のウインドウが分からないので、URL に window の id を含めてもらい
 * （core/paths.ts の assetUrl と対）、その id の許可範囲だけで判定する。
 * 全ウインドウの許可範囲をひとまとめにすると、別のウインドウで開いている文書の
 * 隣にあるファイルまで読めてしまう。
 */
const roots = new Map<number, string>()

export function setAssetRoot(windowId: number, dir: string | null): void {
  if (dir) roots.set(windowId, resolve(dir))
  else roots.delete(windowId)
}

export function clearAssetRoot(windowId: number): void {
  roots.delete(windowId)
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: false } }
  ])
}

export function handleAssetScheme(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    try {
      // mdv-asset://local/<ウインドウ id>/<URL エンコードした絶対パス>
      const matched = /^\/(\d+)\/(.+)$/.exec(new URL(request.url).pathname)
      if (!matched) return new Response('bad request', { status: 400 })

      const root = roots.get(Number(matched[1]))
      const abs = resolve(decodeURIComponent(matched[2]))
      // 表示中の文書があるディレクトリの外は読ませない（意図しないファイル読み出しの防止）
      if (!root || !(abs === root || abs.startsWith(root + sep))) {
        return new Response('forbidden', { status: 403 })
      }
      return await net.fetch(pathToFileURL(abs).toString())
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
