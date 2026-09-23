/** 外部リソース（http, data, カスタムスキーム）かどうか。 */
export function isExternalUrl(src: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')
}

/**
 * 文書のあるディレクトリを基準に相対パスを絶対 POSIX パスへ解決する。
 * レンダラ側（ブラウザ環境）で使うため node:path は使わない。
 */
export function resolveFromDoc(docDir: string, src: string): string {
  const raw = src.startsWith('/') ? src : `${docDir}/${src}`
  const out: string[] = []
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

/** レンダラから読める mdv-asset URL を組み立てる（メイン側の assets.ts と対になる）。 */
export function assetUrl(absPath: string): string {
  return `mdv-asset://local/${encodeURIComponent(absPath)}`
}
