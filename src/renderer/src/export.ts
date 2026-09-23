import { tableToLatex, type LatexOptions } from '@core/table2latex'
import type { TableData } from '@core/table'
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
}

/**
 * 表示中の SVG を、単体で開ける文字列に固める。
 * 画面では幅に追従させるため width/height を外しているので、ここで実寸に戻す。
 */
export function snapshotSvg(fig: HTMLElement, opts: { background?: string | null } = {}): SvgSnapshot | null {
  const src = fig.querySelector('svg')
  if (!src) return null

  const width = Number(fig.dataset['width']) || src.getBoundingClientRect().width
  const height = Number(fig.dataset['height']) || src.getBoundingClientRect().height

  const clone = src.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.removeAttribute('style')
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)

  if (opts.background) {
    // viewBox の原点は 0,0 とは限らないため、百分率ではなく viewBox の値で敷く
    const vb = clone.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
    const box = vb && vb.length === 4 ? vb : [0, 0, width, height]
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(box[0]))
    rect.setAttribute('y', String(box[1]))
    rect.setAttribute('width', String(box[2]))
    rect.setAttribute('height', String(box[3]))
    rect.setAttribute('fill', opts.background)
    clone.insertBefore(rect, clone.firstChild)
  }

  return { markup: new XMLSerializer().serializeToString(clone), width, height }
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
  opts: { scale: number; transparent: boolean }
): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: opts.transparent ? null : '#ffffff' })
  if (!snap) throw new Error('書き出せる図がありません')
  const bytes = await toPngBytes(snap, opts.scale)
  return window.api.save(request(ctx, figureStem(fig), 'png', 'PNG 画像'), bytes)
}

export async function exportPdf(ctx: ExportContext, fig: HTMLElement): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: '#ffffff' })
  if (!snap) throw new Error('書き出せる図がありません')
  return window.api.savePdf(request(ctx, figureStem(fig), 'pdf', 'PDF 文書'), snap.markup, snap.width, snap.height)
}

export async function exportSvg(ctx: ExportContext, fig: HTMLElement): Promise<string | null> {
  const snap = snapshotSvg(fig, { background: null })
  if (!snap) throw new Error('書き出せる図がありません')
  return window.api.save(request(ctx, figureStem(fig), 'svg', 'SVG 画像'), snap.markup)
}

export async function copyTableLatex(table: TableData, options: LatexOptions): Promise<void> {
  await window.api.copyText(tableToLatex(table, options))
}

export async function saveTableLatex(
  ctx: ExportContext,
  table: TableData,
  options: LatexOptions
): Promise<string | null> {
  return window.api.save(request(ctx, table.id, 'tex', 'LaTeX ソース'), tableToLatex(table, options))
}
