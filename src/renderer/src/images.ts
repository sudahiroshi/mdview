import { platform } from '../../platform'

/**
 * data-src に残された相対パスを、実際に表示できる URL に差し替える。
 * 解決できたかどうかを返す（ブラウザ版はフォルダの許可が要る）。
 */
export async function resolveImages(host: HTMLElement, docDir: string): Promise<{ unresolved: number }> {
  const images = [...host.querySelectorAll<HTMLImageElement>('img[data-src]')]
  let unresolved = 0

  await Promise.all(
    images.map(async (img) => {
      const src = img.dataset['src']
      if (!src) return
      const url = await platform.resolveImage(docDir, src)
      if (url) {
        img.src = url
        return
      }
      // src の無い img はブラウザが壊れアイコンを描いてしまう。
      // 画面でも書き出した PDF でも見苦しいので、文字の代替に差し替える。
      const box = document.createElement('span')
      box.className = 'image-missing'
      box.textContent = img.alt ? `${img.alt}（${src}）` : src
      box.title = `画像を読み込めません: ${src}`
      img.replaceWith(box)
      unresolved++
    })
  )

  return { unresolved }
}
