import MarkdownItFactory, { type MarkdownIt, type Token, type StateCore } from 'markdown-it'
import attrs from 'markdown-it-attrs'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { isExternalUrl, resolveFromDoc, assetUrl } from './paths.js'
import { parseFenceInfo, type DiagramKind, diagramKindOf } from './fence.js'
import { implicitFigures, tableCaptions } from './structure.js'
import { applyNumbering, type NumberingOptions, type OutlineItem, type LabelEntry } from './numbering.js'
import { extractTables, type TableData } from './table.js'

export interface DiagramBlock {
  kind: DiagramKind
  code: string
  id: string | null
  caption: string | null
}

export interface RenderEnv {
  /** 表示中の .md があるディレクトリ。相対パスの画像解決に使う。 */
  docDir: string
  /** 図式ブロックの原文。HTML には添字だけを埋め、実体はここから取り出す。 */
  diagrams: DiagramBlock[]
  /** 番号付けの設定。core ルールから参照する。 */
  numbering: NumberingOptions
  /** 番号付けの結果（アウトラインと参照表）。 */
  outline: OutlineItem[]
  labels: Map<string, LabelEntry>
  /** 文書タイトルとみなした見出しの文言（無ければ null）。 */
  docTitle: string | null
  /** 表の構造。LaTeX 書き出しで使う。 */
  tables: Map<string, TableData>
  [key: string | symbol]: unknown
}

/** 見出しテキストから id を作る。日本語はそのまま残す（要素 id には使える）。 */
export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[\s　]+/g, '-')
      .replace(/[[\]{}()#?/\\!"'`,.;:<>|*&^$@=+~%]/g, '')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/** 見出しに id を振る。{#id} で明示されていればそれを尊重する。 */
function headingIds(md: MarkdownIt): void {
  md.core.ruler.push('mdview_heading_ids', (state: StateCore) => {
    const used = new Set<string>()
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]
      if (open.type !== 'heading_open') continue
      const inline = tokens[i + 1]
      const explicit = open.attrGet('id')
      const id = explicit != null ? String(explicit) : slugify(inline?.content ?? '')
      let unique = id
      for (let n = 2; used.has(unique); n++) unique = `${id}-${n}`
      used.add(unique)
      open.attrSet('id', unique)
    }
    return true
  })
}

/** 相対パスの画像をメインプロセスが配信できる mdv-asset URL に差し替える。 */
function localImages(md: MarkdownIt): void {
  const base = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const docDir = (env as Partial<RenderEnv> | undefined)?.docDir
    const token = tokens[idx]
    const src = token.attrGet('src')?.toString()
    if (src && !isExternalUrl(src) && docDir) {
      token.attrSet('src', assetUrl(resolveFromDoc(docDir, src)))
      token.attrSet('data-src', src)
    }
    return base ? base(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }
}

/**
 * mermaid / dot / plantuml のフェンスを図式のプレースホルダに置き換える。
 * 原文は env.diagrams に退避し、HTML には添字だけを埋める
 * （data 属性へ直接入れるとエスケープの往復で壊れやすいため）。
 */
function diagramFences(md: MarkdownIt): void {
  const base = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const info = parseFenceInfo(token.info)
    const kind = diagramKindOf(info.lang)
    if (!kind) return base ? base(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)

    const list = (env as Partial<RenderEnv>)?.diagrams
    if (!list) return base ? base(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)

    const id = info.id ?? token.attrGet('id')?.toString() ?? null
    const caption = info.caption ?? token.attrGet('caption')?.toString() ?? null
    const index = list.push({ kind, code: token.content, id, caption }) - 1
    const meta = token.meta as { number?: string | null; id?: string } | undefined
    const figId = meta?.id ?? id
    const idAttr = figId ? ` id="${md.utils.escapeHtml(figId)}"` : ''
    const num = meta?.number ? `<span class="num num-fig">${md.utils.escapeHtml(meta.number)}</span> ` : ''
    const capBody = caption ? md.utils.escapeHtml(caption) : ''
    return (
      `<figure class="diagram" data-diagram="${index}" data-kind="${kind}"${idAttr}>` +
      `<div class="diagram-body" role="img" aria-label="${md.utils.escapeHtml(caption ?? kind)}">` +
      `<span class="diagram-pending">描画中…</span></div>` +
      (num || capBody ? `<figcaption>${num}${capBody}</figcaption>` : '') +
      `</figure>\n`
    )
  }
}

/** table_open の直後に caption 要素を出力する（HTML では caption は table の先頭に置く）。 */
function tableCaptionRenderer(md: MarkdownIt): void {
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const meta = token.meta as { caption?: { children: Token[] }; number?: string | null } | undefined
    const html = self.renderToken(tokens, idx, options)
    if (!meta?.caption && !meta?.number) return html
    const num = meta.number ? `<span class="num num-tbl">${md.utils.escapeHtml(meta.number)}</span> ` : ''
    const body = meta.caption ? md.renderer.renderInline(meta.caption.children, options, env) : ''
    return `${html}<caption>${num}${body}</caption>`
  }
}

/** 外部リンクを新規ウインドウ扱いにする（メイン側で既定ブラウザへ回される）。 */
function externalLinks(md: MarkdownIt): void {
  const base = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx].attrGet('href')?.toString() ?? ''
    if (/^https?:/i.test(href)) tokens[idx].attrSet('target', '_blank')
    return base ? base(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
  }
}

export function createParser(): MarkdownIt {
  const md = new MarkdownItFactory({
    html: true, // 自分の文書では <br> や <details> を使うため許可し、DOM 挿入前に sanitize する
    linkify: true,
    typographer: false,
    breaks: false
  })
  md.use(attrs, { allowedAttributes: ['id', 'class', 'width', 'height', 'caption'] })
  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: { throwOnError: false, strict: false }
  })
  headingIds(md)
  implicitFigures(md)
  tableCaptions(md)
  md.core.ruler.push('mdview_numbering', (state) => {
    const env = state.env as RenderEnv
    const result = applyNumbering(state, md, env.numbering)
    env.outline = result.outline
    env.labels = result.labels
    env.docTitle = result.title
    env.tables = extractTables(state.tokens)
    return true
  })
  diagramFences(md)
  tableCaptionRenderer(md)
  localImages(md)
  externalLinks(md)
  return md
}

export interface ParsedDoc {
  tokens: Token[]
  env: RenderEnv
}

export function parse(md: MarkdownIt, source: string, docDir: string, numbering: NumberingOptions): ParsedDoc {
  const env: RenderEnv = {
    docDir,
    diagrams: [],
    numbering,
    outline: [],
    labels: new Map(),
    docTitle: null,
    tables: new Map()
  }
  return { tokens: md.parse(source, env), env }
}

export function renderTokens(md: MarkdownIt, doc: ParsedDoc): string {
  return md.renderer.render(doc.tokens, md.options, doc.env)
}
