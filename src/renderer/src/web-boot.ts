import { requestDocPdf } from '../../platform/web'

/**
 * ブラウザ版だけの初期化。
 * デスクトップ版はメニューやメインプロセスが受け持っている部分を、ここで補う。
 */
export function bootWeb(openDialog: () => void): void {
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = './manifest.webmanifest'
  const themeColor = document.createElement('meta')
  themeColor.name = 'theme-color'
  themeColor.content = '#2b49c9'
  document.head.append(manifest, themeColor)

  // 開発中は資材を握られると変更が届かなくなるので、本番ビルドでだけ登録する
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js').catch(() => undefined)
    })
  }

  // デスクトップ版のメニューに当たるショートカット
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    if (e.key === 'o') {
      e.preventDefault()
      openDialog()
    } else if (e.key === 'p') {
      e.preventDefault()
      requestDocPdf()
    }
  })
}
