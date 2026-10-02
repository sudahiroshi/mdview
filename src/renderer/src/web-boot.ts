import { openLaunchedFile, requestDocPdf } from '../../platform/web'
import type { DocPayload } from '../../platform/types'

/** File Handling API。対応していないブラウザには生えない。 */
type LaunchQueue = {
  setConsumer(cb: (params: { files?: FileSystemFileHandle[] }) => void): void
}

/**
 * OS から .md を渡されて起動したときに受け取る。
 *
 * manifest で `file_handlers` を宣言しているので、インストールすると Chrome が
 * 「.md を mdview に開かせるか」と尋ねる。ここで受け取らないと、許可した利用者が
 * Finder から開いたときに空のまま起動してしまう。
 *
 * ブラウザ版は 1 枚の画面に 1 つの文書しか持てないので、複数渡されたら先頭だけ開く。
 *
 * 受け口を張るのは設定を読み終えてから。描画は設定に依らないと決まらないので、
 * 先に張ると起動と競って設定前の描画になりうる。
 */
export function acceptLaunchedFiles(show: (doc: DocPayload) => void): void {
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue
  if (!queue) return
  queue.setConsumer((params) => {
    const handle = params.files?.[0]
    if (!handle) return // ファイル無しの起動。通常どおり空で始める
    void openLaunchedFile(handle).then((doc) => doc && show(doc))
  })
}

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
