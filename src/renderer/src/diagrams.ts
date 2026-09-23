import mermaid from 'mermaid'
import { instance as vizInstance } from '@viz-js/viz'
import type { DiagramBlock } from '@core/markdown'
import { sanitizeInPlace } from '@core/sanitize'

type Viz = Awaited<ReturnType<typeof vizInstance>>

let viz: Promise<Viz> | null = null
/** 描画済み SVG の記憶。表示モードを切り替えるたびに mermaid を回し直さないため。 */
const svgCache = new Map<string, string>()
/** 文書を渡り歩くうちに際限なく溜まらないよう上限を設ける。 */
const CACHE_LIMIT = 200
let mermaidReady = false
let seq = 0

function getViz(): Promise<Viz> {
  viz ??= vizInstance()
  return viz
}

function initMermaid(): void {
  if (mermaidReady) return
  // アプリのテーマに関わらず常に明るい配色で描く。
  // 書き出した図は白背景の資料に貼ることが前提なので、見た目を固定したほうが扱いやすい。
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    // 既定の look（neo）はノードに filter:drop-shadow を掛ける。
    // CSS フィルタが掛かった要素は Chromium の印刷経路でラスタライズされるため、
    // PDF がベクターでなくなる。classic は装飾を使わず、資料への貼り込みにも向く。
    look: 'classic',
    securityLevel: 'strict',
    fontFamily: "-apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
    // ラベルを foreignObject ではなく text 要素で描かせる。
    // foreignObject は <img> 経由のラスタライズで無視されるため、
    // このままでは PNG 書き出しで文字が消える。
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false }
  })
  mermaidReady = true
}

async function toSvg(block: DiagramBlock): Promise<string> {
  const key = `${block.kind}\u0000${block.code}`
  const hit = svgCache.get(key)
  if (hit !== undefined) return hit
  const svg = await renderSvg(block)
  if (svgCache.size >= CACHE_LIMIT) svgCache.delete(svgCache.keys().next().value as string)
  svgCache.set(key, svg)
  return svg
}

async function renderSvg(block: DiagramBlock): Promise<string> {
  switch (block.kind) {
    case 'mermaid': {
      initMermaid()
      const id = `mmd-${++seq}`
      try {
        const { svg } = await mermaid.render(id, block.code)
        return svg
      } finally {
        // mermaid は構文エラー時に作業用の要素を body へ残すので自前で片付ける
        document.getElementById(`d${id}`)?.remove()
      }
    }
    case 'graphviz': {
      const v = await getViz()
      return v.renderString(block.code, { format: 'svg' })
    }
    case 'plantuml':
      return window.api.renderPlantUml(block.code)
  }
}

/**
 * 生成元によってまちまちな SVG のサイズ指定を揃える。
 * 実寸（viewBox 基準）を既定の表示サイズにしつつ、狭いときだけ縮むようにする。
 * mermaid は width="100%" を付けてくるため、そのままだと縦に極端に伸びる。
 */
function normalizeSvg(el: SVGSVGElement, fig: HTMLElement): void {
  const vb = el.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const attrW = parseFloat(el.getAttribute('width') ?? '')
  const attrH = parseFloat(el.getAttribute('height') ?? '')
  const w = vb && vb.length === 4 && vb[2] > 0 ? vb[2] : attrW
  const h = vb && vb.length === 4 && vb[3] > 0 ? vb[3] : attrH

  if (!vb && Number.isFinite(w) && Number.isFinite(h)) {
    el.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  el.removeAttribute('width')
  el.removeAttribute('height')
  if (Number.isFinite(w) && Number.isFinite(h)) {
    // 高さを px で固定すると、幅が狭まったときに中身だけが縮んで
    // 上下に大きな余白が残る。縦横比を与えて高さを追従させる。
    el.style.width = `${w}px`
    el.style.height = 'auto'
    el.style.aspectRatio = `${w} / ${h}`
    // 書き出し時に実寸が必要になるので保持しておく
    fig.dataset['width'] = String(w)
    fig.dataset['height'] = String(h)
  }
  el.style.maxWidth = '100%'
  el.style.removeProperty('max-height')
}

function errorBox(kind: string, message: string): HTMLElement {
  const box = document.createElement('div')
  box.className = 'diagram-error'
  const head = document.createElement('strong')
  head.textContent = `${kind} の描画に失敗しました`
  const body = document.createElement('pre')
  body.textContent = message
  box.append(head, body)
  return box
}

/**
 * プレースホルダとして出力済みの figure.diagram を、実際の SVG で埋める。
 * 図ごとに独立して解決するので、1 つ失敗しても他は描画される。
 */
export async function renderDiagrams(host: HTMLElement, blocks: DiagramBlock[]): Promise<void> {
  const figures = [...host.querySelectorAll<HTMLElement>('figure.diagram[data-diagram]')]
  await Promise.all(
    figures.map(async (fig) => {
      const block = blocks[Number(fig.dataset['diagram'])]
      const body = fig.querySelector<HTMLElement>('.diagram-body')
      if (!block || !body) return
      try {
        const svg = await toSvg(block)
        body.innerHTML = svg
        sanitizeInPlace(body)
        const el = body.querySelector('svg')
        if (el) normalizeSvg(el, fig)
        fig.dataset['state'] = 'ready'
      } catch (e) {
        body.replaceChildren(errorBox(block.kind, (e as Error).message))
        fig.dataset['state'] = 'error'
      }
    })
  )
}
