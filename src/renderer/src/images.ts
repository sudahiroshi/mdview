import { platform } from '../../platform'

/** 実際に読み込めたかどうかを見る。URL が決まっても配信側に断られることがある。 */
function load(img: HTMLImageElement, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(true), { once: true })
    img.addEventListener('error', () => resolve(false), { once: true })
    img.src = url
  })
}

/** 読み込めなかった画像を、理由の分かる代替表示に置き換える。 */
function replaceWithNotice(img: HTMLImageElement, src: string): void {
  const box = document.createElement('span')
  box.className = 'image-missing'
  box.textContent = img.alt ? `${img.alt}（${src}）` : src
  box.title = `画像を読み込めません: ${src}`
  img.replaceWith(box)
}

/**
 * data-src に残された相対パスを、実際に表示できる URL に差し替える。
 * 読み込めなかった数を返す。
 */
export async function resolveImages(host: HTMLElement, docDir: string): Promise<{ unresolved: number }> {
  const images = [...host.querySelectorAll<HTMLImageElement>('img[data-src]')]
  let unresolved = 0

  await Promise.all(
    images.map(async (img) => {
      const src = img.dataset['src']
      if (!src) return
      const url = await platform.resolveImage(docDir, src)
      // URL が決まっても、配信側が断ることがある（文書の外にある画像、外部 URL）。
      // 壊れアイコンのまま残すと画面でも書き出した PDF でも見苦しいので、
      // 実際に読めたかどうかまで見てから差し替える。
      if (url && (await load(img, url))) return
      replaceWithNotice(img, src)
      unresolved++
    })
  )

  return { unresolved }
}
