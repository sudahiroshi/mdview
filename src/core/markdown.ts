import MarkdownItFactory, { type MarkdownIt, type Token, type StateCore } from 'markdown-it'
import attrs from 'markdown-it-attrs'
import { isExternalUrl, resolveFromDoc, assetUrl } from './paths.js'

export interface RenderEnv {
  /** 表示中の .md があるディレクトリ。相対パスの画像解決に使う。 */
  docDir: string
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
  headingIds(md)
  localImages(md)
  externalLinks(md)
  return md
}

export interface ParsedDoc {
  tokens: Token[]
  env: RenderEnv
}

export function parse(md: MarkdownIt, source: string, docDir: string): ParsedDoc {
  const env: RenderEnv = { docDir }
  return { tokens: md.parse(source, env), env }
}

export function renderTokens(md: MarkdownIt, doc: ParsedDoc): string {
  return md.renderer.render(doc.tokens, md.options, doc.env)
}
