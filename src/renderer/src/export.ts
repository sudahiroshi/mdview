import { tableToLatex, type LatexOptions } from '@core/table2latex'
import type { TableData } from '@core/table'
import { platform } from '../../platform'
import type { SaveRequest } from '@core/types'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface ExportContext {
  /** 表示中の文書のパス。保存先の初期位置とファイル名の元にする。 */
  docPath: string | null
}

/** macOS の Finder はファイル名中の ':' を '/' として表示するため避ける。 */
function safeName(text: string): string {
  return text.replace(/[/:\\]/g, '-').replace(/\s+/g, '').slice(0, 60) || 'figure'
}

function baseName(ctx: ExportContext): string {
  return safeName((ctx.docPath ?? 'mdview').replace(/^.*\//, '').replace(/\.[^.]+$/, ''))
}

function dirOf(ctx: ExportContext): string | undefined {
  return ctx.docPath?.replace(/\/[^/]*$/, '')
}

function request(ctx: ExportContext, stem: string, ext: string, filterName: string): SaveRequest {
  return { defaultName: `${baseName(ctx)}-${safeName(stem)}.${ext}`, dir: dirOf(ctx), extensions: [ext], filterName }
}

/** 図の見出しに使う短い名前（id か番号）。保存ファイル名に使う。 */
export function figureStem(fig: HTMLElement): string {
  const id = fig.id
  if (id) return id
  return fig.querySelector('figcaption')?.textContent?.trim() ?? 'figure'
}

export interface SvgSnapshot {
  markup: string
  width: number
  height: number
  /** 敷いた背景色。透過なら null。 */
  background: string | null
}

/**
 * 表示中の SVG を、単体で開ける文字列に固める。
 * 画面では幅に追従させるため width/height を外しているので、ここで実寸に戻す。
 */
export function snapshotSvg(fig: HTMLElement, opts: { background?: string | null } = {}): SvgSnapshot | null {
  const src = fig.querySelector('svg')
  if (!src) return null

  let width = Number(fig.dataset['width']) || src.getBoundingClientRect().width
  let height = Number(fig.dataset['height']) || src.getBoundingClientRect().height

  const clone = src.cloneNode(true) as SVGSVGElement

  // viewBox があるときは、その縦横比どおりの寸法にそろえる。
  // 端数を丸めた寸法のままだと比がわずかにずれ、書き出しの上下か左右に余白が入る。
  const box = clone.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) {
    height = (width * box[3]) / box[2]
  }
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(Math.round(height * 100) / 100))
  clone.removeAttribute('style')
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)

  if (!opts.background) stripBackdrop(src, clone)

  if (opts.background) {
    // viewBox の原点は 0,0 とは限らないため、百分率ではなく viewBox の値で敷く
    const area = box && box.length === 4 ? box : [0, 0, width, height]
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(area[0]))
    rect.setAttribute('y', String(area[1]))
    rect.setAttribute('width', String(area[2]))
    rect.setAttribute('height', String(area[3]))
    rect.setAttribute('fill', opts.background)
    clone.insertBefore(rect, clone.firstChild)
  }

  return {
    markup: new XMLSerializer().serializeToString(clone),
    width,
    height,
    background: opts.background ?? null
  }
}

export const WHITE_FILL = /^(#fff|#ffffff|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))$/i

/**
 * 生成元が自前で敷いている白い下地を取り除く。
 * Graphviz は図の先頭に全面を覆う白いポリゴンを置くので、外さないと透過にならない。
 *
 * 判定は画面に出ている側（src）で行う。図形は入れ子の transform の中にいることがあり、
 * 属性の座標だけでは実際に覆っているかが分からないため。
 * 複製（clone）は src の深い複写なので、同じ並び順の要素を取り除けばよい。
 */
function stripBackdrop(src: SVGSVGElement, clone: SVGSVGElement): void {
  const shapes = [...src.querySelectorAll('rect, polygon')]
  const copies = [...clone.querySelectorAll('rect, polygon')]
  const view = src.getBoundingClientRect()
  if (view.width === 0 || view.height === 0) return

  // 先頭付近だけを見る。図の中身にある白い塗りまで消さないため
  for (let i = 0; i < Math.min(3, shapes.length); i++) {
    if (!WHITE_FILL.test((shapes[i].getAttribute('fill') ?? '').trim())) continue
    const r = shapes[i].getBoundingClientRect()
    if (r.width >= view.width - 1 && r.height >= view.height - 1) copies[i]?.remove()
  }
}

export async function toPngBytes(snap: SvgSnapshot, scale: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([snap.markup], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.width = snap.width
    img.height = snap.height
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG を画像として読み込めませんでした'))
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(snap.width * scale))
    canvas.height = Math.max(1, Math.round(snap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas を初期化できませんでした')
    // SVG 内の矩形は viewBox の範囲しか塗れない。丸めの差で縁に透明な帯が残るのを防ぐため、
    // 画布そのものを塗ってから描く
    if (snap.background) {
      ctx.fillStyle = snap.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.drawImage(img, 0, 0, snap.width, snap.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG を生成できませんでした')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportPng(
  ctx: ExportContext,
  fig: HTMLElement,
  opts: BackgroundOption & { scale: number }
): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: backgroundOf(opts) })
  if (!snap) throw new Error('書き出せる図がありません')
  const bytes = await toPngBytes(snap, opts.scale)
  return platform.save(request(ctx, figureStem(fig), 'png', 'PNG 画像'), bytes)
}

export interface BackgroundOption {
  transparent: boolean
}

/** 透過指定を、実際に敷く色（透過なら null）に直す。 */
function backgroundOf(opts: BackgroundOption): string | null {
  return opts.transparent ? null : '#ffffff'
}

/**
 * PDF は常に白背景になる。Chromium の書き出しがページ全面を必ず塗るため、
 * こちら側で透過にする手立てがない（背景を持たない SVG でも白が入る）。
 */
export async function exportPdf(ctx: ExportContext, fig: HTMLElement): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: '#ffffff' })
  if (!snap) throw new Error('書き出せる図がありません')
  return platform.savePdf(request(ctx, figureStem(fig), 'pdf', 'PDF 文書'), snap.markup, snap.width, snap.height)
}

export async function exportSvg(
  ctx: ExportContext,
  fig: HTMLElement,
  opts: BackgroundOption
): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: backgroundOf(opts) })
  if (!snap) throw new Error('書き出せる図がありません')
  return platform.save(request(ctx, figureStem(fig), 'svg', 'SVG 画像'), snap.markup)
}

export async function copyTableLatex(table: TableData, options: LatexOptions): Promise<void> {
  await platform.copyText(tableToLatex(table, options))
}

export async function saveTableLatex(
  ctx: ExportContext,
  table: TableData,
  options: LatexOptions
): Promise<string | null> {
  return platform.save(request(ctx, table.id, 'tex', 'LaTeX ソース'), tableToLatex(table, options))
}
