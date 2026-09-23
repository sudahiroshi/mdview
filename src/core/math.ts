import { mathjax } from 'mathjax-full/js/mathjax.js'
import { TeX } from 'mathjax-full/js/input/tex.js'
import { SVG } from 'mathjax-full/js/output/svg.js'
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js'
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js'
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js'

/**
 * 数式の描画。KaTeX ではなく MathJax を使うのは、出力が SVG になるため。
 * SVG であれば図と同じ経路で PDF / PNG / SVG に書き出せる。
 *
 * liteAdaptor は DOM を使わない実装なので、レンダラでも Node のテストでも同じに動く。
 */
const adaptor = liteAdaptor()
RegisterHTMLHandler(adaptor)

const svgOutput = new SVG({
  // 既定の 'global' はグリフの実体を文書内の共有 defs へ逃がす。
  // その状態で数式 1 つだけ取り出して保存すると文字が消えるため、必ず自己完結させる。
  fontCache: 'local'
})

const mathDocument = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: svgOutput
})

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )
}

/**
 * TeX を MathJax の SVG へ変換する。
 * 返るのは `<mjx-container>` ごとの HTML。インライン数式の縦位置合わせを
 * MathJax に任せられ、書き出し側は中の `<svg>` だけを取り出せる。
 */
export function renderMath(tex: string, displayMode: boolean): string {
  try {
    const node = mathDocument.convert(tex, { display: displayMode })
    return adaptor.outerHTML(node)
  } catch (e) {
    // 壊れた TeX で文書全体の描画を止めない
    return `<span class="math-error" title="${escapeHtml((e as Error).message)}">${escapeHtml(tex)}</span>`
  }
}

/**
 * mjx-container の体裁を整える CSS。
 * liteAdaptor を使うと MathJax が自分でスタイルを差し込まないので、自分で入れる。
 */
export function mathStyleSheet(): string {
  return adaptor.textContent(svgOutput.styleSheet(mathDocument) as never)
}

/** markdown-it-texmath に渡す描画エンジン（KaTeX と同じ形に合わせてある）。 */
export const mathEngine = {
  renderToString(tex: string, options?: { displayMode?: boolean }): string {
    return renderMath(tex, options?.displayMode === true)
  }
}
