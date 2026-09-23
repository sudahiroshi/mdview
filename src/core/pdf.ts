/** 文書全体を PDF にするときの、ヘッダー・フッターの組み立て。 */

export type Placement = 'none' | 'header' | 'footer'
export type Align = 'left' | 'center' | 'right'
export type PageSize = 'A4' | 'A5' | 'B5' | 'Letter' | 'Legal'

export interface DocPdfOptions {
  /** ヘッダー／フッターに出す文書名。 */
  title: string
  titlePlacement: Placement
  titleAlign: Align
  pageNumberPlacement: Placement
  pageNumberAlign: Align
  /** ページ番号に総ページ数を添える（3 / 12）。 */
  showTotalPages: boolean
  pageSize: PageSize
  /** 本文の余白（mm）。ヘッダー・フッターはこの余白の中に置かれる。 */
  marginMm: number
}

export const DOC_PDF_DEFAULTS: DocPdfOptions = {
  title: '',
  titlePlacement: 'header',
  titleAlign: 'left',
  pageNumberPlacement: 'footer',
  pageNumberAlign: 'center',
  showTotalPages: false,
  pageSize: 'A4',
  marginMm: 20
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

type Slots = Record<Align, string[]>

const emptySlots = (): Slots => ({ left: [], center: [], right: [] })

/**
 * Chromium の印刷ヘッダーは既定の font-size が 0 で、外部リソースも読み込めない。
 * そのため寸法と書体はすべてインラインで指定する。
 * class="pageNumber" / "totalPages" は Chromium が実際の値に差し替える。
 */
function band(slots: Slots, marginMm: number): string {
  const cell = (align: Align): string =>
    `<div style="flex:1 1 0;text-align:${align};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${slots[align].join(' ')}</div>`
  return (
    `<div style="width:100%;box-sizing:border-box;padding:0 ${marginMm}mm;` +
    `font-size:9pt;line-height:1.4;color:#444;` +
    `font-family:'Hiragino Sans','Noto Sans JP','Helvetica Neue',sans-serif;` +
    `display:flex;align-items:center;">${cell('left')}${cell('center')}${cell('right')}</div>`
  )
}

export interface Templates {
  headerTemplate: string
  footerTemplate: string
  displayHeaderFooter: boolean
}

export function buildTemplates(o: DocPdfOptions): Templates {
  const header = emptySlots()
  const footer = emptySlots()
  const pick = (p: Placement): Slots | null => (p === 'header' ? header : p === 'footer' ? footer : null)

  const titleSlot = pick(o.titlePlacement)
  if (titleSlot && o.title.trim()) titleSlot[o.titleAlign].push(escapeHtml(o.title.trim()))

  const pageSlot = pick(o.pageNumberPlacement)
  if (pageSlot) {
    pageSlot[o.pageNumberAlign].push(
      o.showTotalPages
        ? '<span class="pageNumber"></span> / <span class="totalPages"></span>'
        : '<span class="pageNumber"></span>'
    )
  }

  const used = [header, footer].some((s) => s.left.length || s.center.length || s.right.length)
  return {
    // displayHeaderFooter が真のとき空文字を渡すと Chromium の既定（URL や日付）が出てしまうため、
    // 使わない側にも空の要素を渡して打ち消す
    headerTemplate: used ? band(header, o.marginMm) : '<span></span>',
    footerTemplate: used ? band(footer, o.marginMm) : '<span></span>',
    displayHeaderFooter: used
  }
}

const MM_PER_INCH = 25.4

/** 用紙の寸法（mm）。 */
const PAGE_MM: Record<PageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  B5: { width: 182, height: 257 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 }
}

const CSS_DPI = 96

/**
 * 本文が載る領域を CSS ピクセルで返す。
 * これより大きい図はページからはみ出して空白ページを生むので、収まるまで縮める。
 */
export function contentBoxPx(o: DocPdfOptions): { width: number; height: number } {
  const page = PAGE_MM[o.pageSize]
  const m = marginsInInches(o)
  return {
    width: Math.round((page.width / MM_PER_INCH - m.left - m.right) * CSS_DPI),
    height: Math.round((page.height / MM_PER_INCH - m.top - m.bottom) * CSS_DPI)
  }
}

/**
 * printToPDF に渡す用紙指定。
 * B5 は Chromium が名前で解釈できないため、JIS B5（182x257mm）を実寸で渡す。
 */
export function pageSizeFor(o: DocPdfOptions): Exclude<PageSize, 'B5'> | { width: number; height: number } {
  if (o.pageSize === 'B5') return { width: 182 / MM_PER_INCH, height: 257 / MM_PER_INCH }
  return o.pageSize
}

/** ヘッダー・フッターが余白に収まるよう、必要なら余白を広げる。 */
export function marginsInInches(o: DocPdfOptions): { top: number; bottom: number; left: number; right: number } {
  const base = o.marginMm / MM_PER_INCH
  const needsHeader = o.titlePlacement === 'header' || o.pageNumberPlacement === 'header'
  const needsFooter = o.titlePlacement === 'footer' || o.pageNumberPlacement === 'footer'
  const least = 15 / MM_PER_INCH
  return {
    top: needsHeader ? Math.max(base, least) : base,
    bottom: needsFooter ? Math.max(base, least) : base,
    left: base,
    right: base
  }
}

/** CSS の文字列リテラルとして安全な形にする。 */
function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const MARGIN_BOX: Record<'header' | 'footer', Record<Align, string>> = {
  header: { left: '@top-left', center: '@top-center', right: '@top-right' },
  footer: { left: '@bottom-left', center: '@bottom-center', right: '@bottom-right' }
}

/**
 * ブラウザで印刷するときの @page 規則を組み立てる。
 *
 * Electron 版は printToPDF のヘッダー・フッター雛形を使うが、ブラウザには
 * その入口が無い。代わりに CSS のマージンボックスと counter(page) を使う
 * （Chromium は 131 以降で対応）。16 個のマージンボックスが
 * 「上下 × 左中右」の指定にそのまま対応する。
 */
export function buildPageCss(o: DocPdfOptions): string {
  const boxes = new Map<string, string[]>()
  const add = (placement: Placement, align: Align, content: string): void => {
    if (placement === 'none') return
    const key = MARGIN_BOX[placement][align]
    boxes.set(key, [...(boxes.get(key) ?? []), content])
  }

  if (o.title.trim()) add(o.titlePlacement, o.titleAlign, cssString(o.title.trim()))
  add(
    o.pageNumberPlacement,
    o.pageNumberAlign,
    o.showTotalPages ? 'counter(page) " / " counter(pages)' : 'counter(page)'
  )

  const m = marginsInInches(o)
  const mm = (inches: number): string => `${(inches * MM_PER_INCH).toFixed(2)}mm`
  const size = o.pageSize === 'B5' ? '182mm 257mm' : o.pageSize
  const rules = [...boxes].map(
    ([box, parts]) =>
      `  ${box} { content: ${parts.join(' " " ')}; font-size: 9pt; color: #444; ` +
      `font-family: 'Hiragino Sans', 'Noto Sans JP', sans-serif; }`
  )

  return [
    '@page {',
    `  size: ${size};`,
    `  margin: ${mm(m.top)} ${mm(m.right)} ${mm(m.bottom)} ${mm(m.left)};`,
    ...rules,
    '}'
  ].join('\n')
}
