import type { MarkdownIt, StateCore, Token } from 'markdown-it'
import { LABELS } from './labels.js'
import { parseFenceInfo, diagramKindOf } from './fence.js'
import type { NumberMode, NumberStyle } from './types.js'

export type EntryKind = 'sec' | 'fig' | 'tbl'

export interface OutlineItem {
  kind: EntryKind
  /** 見出しの階層。図表では最上位見出しと同じ深さに置くため 0 とする。 */
  level: number
  id: string
  /** 表示用の番号。番号を出さない設定のときは null。 */
  number: string | null
  text: string
}

export interface LabelEntry {
  kind: EntryKind
  id: string
  /** 本文から参照したときに表示する番号（「第1章」「1.1 節」「図 1.1」）。 */
  ref: string | null
  /** 番号が無いときに参照の見出しとして使う本文テキスト。 */
  text: string
}

export interface NumberingOptions {
  mode: NumberMode
  style: NumberStyle
}

export interface NumberingResult {
  outline: OutlineItem[]
  labels: Map<string, LabelEntry>
}

const REF_PATTERN = /\[@([A-Za-z][A-Za-z0-9_:.-]*)\]/g

/**
 * インライン子トークンから表示テキストを取り出す（アウトライン用）。
 * token.content は {#id} などの属性記法を含む生の行なので使わない。
 */
export function inlineText(children: Token[] | null | undefined): string {
  const parts: string[] = []
  for (const c of children ?? []) {
    if (c.type === 'text' || c.type === 'code_inline') parts.push(c.content)
    else if (c.type === 'softbreak' || c.type === 'hardbreak') parts.push(' ')
    else if (c.children) parts.push(inlineText(c.children))
  }
  return parts.join('').trim()
}

function isDiagramFence(token: Token): boolean {
  return token.type === 'fence' && diagramKindOf(parseFenceInfo(token.info).lang) !== null
}

/** 指定位置から後方の figcaption の inline トークンを探す。 */
function findCaptionInline(tokens: Token[], from: number, closeType: string): Token | null {
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i].type === closeType) return null
    if (tokens[i].type === 'figcaption_open' && tokens[i + 1]?.type === 'inline') return tokens[i + 1]
  }
  return null
}

/**
 * 見出し・図・表に番号を振り、[@id] 参照を解決する。
 *
 * 章（最上位見出し）が H1 で存在するときは図表を「章.通番」で、
 * H1 が無い文書では通し番号で採番する。
 */
export function applyNumbering(state: StateCore, md: MarkdownIt, opts: NumberingOptions): NumberingResult {
  const tokens = state.tokens
  const L = LABELS[opts.style]
  const showHeadings = opts.mode !== 'none'
  const showFloats = opts.mode === 'full'

  const headingAt = tokens.reduce<number[]>((acc, t, i) => (t.type === 'heading_open' ? [...acc, i] : acc), [])
  const headingLevels = headingAt.map((i) => Number(tokens[i].tag.slice(1)))

  // 冒頭の H1 が文書中に 1 つしかなければ、章ではなく文書タイトルとみなす。
  // README や論文のように「# タイトル」の下に「## 序論」が並ぶ書き方では、
  // H1 を第1章として数えると実態と合わないため、H2 から章として数える。
  const titleIndex = headingLevels[0] === 1 && headingLevels.filter((l) => l === 1).length === 1 ? headingAt[0] : -1

  // 章立ての文書かどうかは H1 の有無で判断する（タイトルとして使われている場合も含む）。
  const hasChapters = headingLevels.includes(1)
  const numberedLevels = headingLevels.filter((_, k) => headingAt[k] !== titleIndex)
  const topLevel = numberedLevels.length ? Math.min(...numberedLevels) : 1

  // 章より前に図表があると「図 1」と「図 1.1」が同じ文書に混在してしまう。
  // そうなる文書は最初から通し番号に倒して、番号の付き方を一貫させる。
  const firstChapterAt = headingAt.find((i) => i !== titleIndex && Number(tokens[i].tag.slice(1)) === topLevel) ?? -1
  const firstFloatAt = tokens.findIndex((t) => t.type === 'figure_open' || t.type === 'table_open' || isDiagramFence(t))
  const scopedFloats = hasChapters && firstChapterAt >= 0 && (firstFloatAt < 0 || firstFloatAt > firstChapterAt)

  const counters = [0, 0, 0, 0, 0, 0]
  let chapter = 0
  let figCount = 0
  let tblCount = 0
  let autoId = 0
  // id を明示していない図表に振る連番。figCount / tblCount は章ごとに戻るため、
  // そちらを id に使うと章をまたいで id が重複してしまう。
  let autoFigId = 0
  let autoTblId = 0

  const outline: OutlineItem[] = []
  const labels = new Map<string, LabelEntry>()

  const floatNumber = (n: number): string => (scopedFloats && chapter > 0 ? `${chapter}.${n}` : `${n}`)

  const prepend = (inline: Token, html: string): void => {
    const tok = new state.Token('html_inline', '', 0)
    tok.content = html
    inline.children = [tok, ...(inline.children ?? [])]
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok.type === 'heading_open') {
      const inline = tokens[i + 1]
      const text = inlineText(inline?.children)
      const id = String(tok.attrGet('id') ?? `sec-${++autoId}`)
      tok.attrSet('id', id)

      if (i === titleIndex) {
        // タイトルには番号を振らない。参照されたときは見出しの文言をそのまま使う。
        outline.push({ kind: 'sec', level: 1, id, number: null, text })
        labels.set(id, { kind: 'sec', id, ref: null, text })
        continue
      }

      const level = Number(tok.tag.slice(1))
      const depth = Math.max(1, level - topLevel + 1)
      // 上位の見出しを飛ばして深い見出しが先に来ても「0.1」を出さないよう、
      // 欠けている祖先の番号を 1 として埋める
      for (let d = 0; d < depth - 1; d++) if (counters[d] === 0) counters[d] = 1
      counters[depth - 1]++
      for (let d = depth; d < counters.length; d++) counters[d] = 0

      const nums = counters.slice(0, depth)
      const isChapter = hasChapters && depth === 1
      if (isChapter) {
        chapter = nums[0]
        if (scopedFloats) {
          figCount = 0
          tblCount = 0
        }
      }

      const dotted = nums.join('.')
      const heading = isChapter ? L.chapterHeading(nums[0]) : dotted
      const ref = isChapter ? L.chapterRef(nums[0]) : L.sectionRef(dotted)

      outline.push({ kind: 'sec', level: depth, id, number: showHeadings ? heading : null, text })
      labels.set(id, { kind: 'sec', id, ref: showHeadings ? ref : null, text })

      if (showHeadings) prepend(inline, `<span class="num num-sec">${md.utils.escapeHtml(heading)}</span> `)
      continue
    }

    if (tok.type === 'figure_open' || isDiagramFence(tok)) {
      figCount++
      const num = floatNumber(figCount)
      const label = L.figure(num)
      const isFence = tok.type === 'fence'
      // markdown-it-attrs が info 文字列から {...} を取り除いて属性にしている場合があるため、
      // info の解析結果とトークン属性の両方を見る
      const info = isFence ? parseFenceInfo(tok.info) : null
      const attrId = tok.attrGet('id')?.toString() ?? null
      const id = (isFence ? (info?.id ?? attrId) : attrId) ?? `fig-${++autoFigId}`
      const captionInline = isFence ? null : findCaptionInline(tokens, i + 1, 'figure_close')
      const text = isFence ? (info?.caption ?? tok.attrGet('caption')?.toString() ?? '') : inlineText(captionInline?.children)

      if (showFloats || text) outline.push({ kind: 'fig', level: 0, id, number: showFloats ? label : null, text })
      labels.set(id, { kind: 'fig', id, ref: showFloats ? label : null, text })

      if (isFence) {
        // フェンスは後段の renderer 規則が HTML を組み立てるので、番号だけ渡す
        tok.meta = { ...(tok.meta ?? {}), number: showFloats ? label : null, id }
      } else {
        tok.attrSet('id', id)
        if (showFloats && captionInline) prepend(captionInline, `<span class="num num-fig">${md.utils.escapeHtml(label)}</span> `)
      }
      continue
    }

    if (tok.type === 'table_open') {
      tblCount++
      const num = floatNumber(tblCount)
      const label = L.table(num)
      const id = String(tok.attrGet('id') ?? `tbl-${++autoTblId}`)
      tok.attrSet('id', id)
      const caption = tok.meta?.caption as { children: Token[] } | undefined
      const text = inlineText(caption?.children)

      if (showFloats || text) outline.push({ kind: 'tbl', level: 0, id, number: showFloats ? label : null, text })
      labels.set(id, { kind: 'tbl', id, ref: showFloats ? label : null, text })

      tok.meta = { ...(tok.meta ?? {}), number: showFloats ? label : null, id }
      continue
    }
  }

  resolveRefs(state, md, labels)
  return { outline, labels }
}

/** 本文中の [@id] をラベル表で解決してリンクに置き換える。 */
function resolveRefs(state: StateCore, md: MarkdownIt, labels: Map<string, LabelEntry>): void {
  /** 置換が起きたときだけ新しい配列を返し、起きなければ null を返す。 */
  const rewrite = (children: Token[]): Token[] | null => {
    let changed = false
    const out: Token[] = []

    for (const child of children) {
      if (child.type !== 'text' || !child.content.includes('[@')) {
        out.push(child)
        continue
      }
      REF_PATTERN.lastIndex = 0
      const pieces: Token[] = []
      let last = 0
      let m: RegExpExecArray | null
      while ((m = REF_PATTERN.exec(child.content)) !== null) {
        if (m.index > last) {
          const text = new state.Token('text', '', 0)
          text.content = child.content.slice(last, m.index)
          pieces.push(text)
        }
        const link = new state.Token('html_inline', '', 0)
        link.content = renderRef(md, m[1], labels.get(m[1]))
        pieces.push(link)
        last = m.index + m[0].length
      }
      if (pieces.length === 0) {
        out.push(child)
        continue
      }
      if (last < child.content.length) {
        const text = new state.Token('text', '', 0)
        text.content = child.content.slice(last)
        pieces.push(text)
      }
      out.push(...pieces)
      changed = true
    }
    return changed ? out : null
  }

  for (const tok of state.tokens) {
    if (tok.type === 'inline' && tok.children) {
      const next = rewrite(tok.children)
      if (next) tok.children = next
    }
    const caption = tok.meta?.caption as { children: Token[] } | undefined
    if (caption) {
      const next = rewrite(caption.children)
      if (next) caption.children = next
    }
  }
}

function renderRef(md: MarkdownIt, id: string, entry: LabelEntry | undefined): string {
  const esc = md.utils.escapeHtml
  if (!entry) return `<span class="xref-missing" title="参照先が見つかりません">[?${esc(id)}]</span>`
  const text = entry.ref ?? entry.text ?? id
  return `<a class="xref" href="#${esc(id)}">${esc(text)}</a>`
}
