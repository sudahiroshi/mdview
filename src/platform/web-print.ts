import { buildPageCss, contentBoxPx } from '../core/pdf.js'
import type { DocPdfOptions } from '../core/pdf.js'

const PRINT_ROOT_ID = 'mdview-print-root'
const PRINT_STYLE_ID = 'mdview-print-style'

/**
 * ブラウザには printToPDF に相当する API が無いので、印刷ダイアログを経由する。
 * 印刷のあいだだけ本文を差し替え、@page で用紙と余白を決める。
 */
function printWith(
  bodyHtml: string,
  pageCss: string,
  extraCss = '',
  prepare?: (root: HTMLElement) => void
): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement('div')
    root.id = PRINT_ROOT_ID
    root.innerHTML = bodyHtml
    prepare?.(root)

    const style = document.createElement('style')
    style.id = PRINT_STYLE_ID
    style.media = 'print'
    style.textContent = `
      ${pageCss}
      body > *:not(#${PRINT_ROOT_ID}) { display: none !important; }
      #${PRINT_ROOT_ID} { display: block; }
      ${extraCss}
    `

    // 画面には出さず、印刷のときだけ現れるようにする
    root.style.display = 'none'
    const show = document.createElement('style')
    show.media = 'print'
    show.textContent = `#${PRINT_ROOT_ID} { display: block !important; }`

    document.head.append(style, show)
    document.body.append(root)

    const cleanup = (): void => {
      window.removeEventListener('afterprint', cleanup)
      root.remove()
      style.remove()
      show.remove()
      resolve()
    }
    window.addEventListener('afterprint', cleanup)

    // 差し込んだ内容のレイアウトが決まってから印刷に入る
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  })
}

const MM_PER_PX = 25.4 / 96

/** 図 1 枚を、その実寸ちょうどの 1 ページとして印刷する。 */
export async function printFigure(svg: string, widthPx: number, heightPx: number, white: boolean): Promise<void> {
  const w = (widthPx * MM_PER_PX).toFixed(2)
  const h = (heightPx * MM_PER_PX).toFixed(2)
  await printWith(
    svg,
    `@page { size: ${w}mm ${h}mm; margin: 0; }`,
    `#${PRINT_ROOT_ID} { ${white ? 'background:#fff;' : ''} }
     #${PRINT_ROOT_ID} svg { display: block; width: ${widthPx}px; height: ${heightPx}px; }`
  )
}

/**
 * ページに収まらない図を、収まるところまで縮める。
 * はみ出したままだと、その分がまるごと空白ページになる。
 * デスクトップ版のオフスクリーン印刷でも同じことをしている。
 */
function fitFigures(root: HTMLElement, box: { width: number; height: number }): void {
  for (const fig of root.querySelectorAll<HTMLElement>('figure.diagram, figure.math')) {
    const svg = fig.querySelector('svg')
    const w = Number(fig.dataset['width'])
    const h = Number(fig.dataset['height'])
    if (!svg || !w || !h) continue
    // 図を囲む枠の余白とキャプションのぶんを見込む
    const k = Math.min(1, (box.width - 36) / w, (box.height - 72) / h)
    svg.style.width = `${Math.floor(w * k)}px`
    svg.style.height = 'auto'
    svg.style.aspectRatio = `${w} / ${h}`
    svg.style.maxWidth = '100%'
  }
}

/** 文書全体を印刷する。文書名とページ番号は @page のマージンボックスで置く。 */
export async function printDocument(bodyHtml: string, options: DocPdfOptions): Promise<void> {
  const box = contentBoxPx(options)
  await printWith(
    bodyHtml,
    buildPageCss(options),
    `#${PRINT_ROOT_ID} .doc { max-width: none; margin: 0; font-size: 10.5pt; line-height: 1.75; }
     #${PRINT_ROOT_ID} figure, #${PRINT_ROOT_ID} pre, #${PRINT_ROOT_ID} .diagram-body { break-inside: avoid; }
     #${PRINT_ROOT_ID} table { break-inside: auto; }
     #${PRINT_ROOT_ID} tr, #${PRINT_ROOT_ID} thead { break-inside: avoid; }
     #${PRINT_ROOT_ID} thead { display: table-header-group; }
     #${PRINT_ROOT_ID} h1, #${PRINT_ROOT_ID} h2, #${PRINT_ROOT_ID} h3 { break-after: avoid; }
     #${PRINT_ROOT_ID} img { max-width: 100%; max-height: ${box.height - 40}px; }
     .export-bar, .popup-menu, .toast { display: none !important; }`,
    (root) => fitFigures(root, box)
  )
}
