import type { MarkdownIt, StateCore, Token } from 'markdown-it'

/** 表キャプション行の書式: `: 実験条件 {#tbl:cond}`（pandoc 互換） */
const CAPTION_PREFIX = /^:\s+/

/** 実体のある子トークンだけを取り出す（空白テキストと改行を無視する）。 */
function meaningfulChildren(inline: Token): Token[] {
  return (inline.children ?? []).filter(
    (c) => c.type !== 'softbreak' && !(c.type === 'text' && c.content.trim() === '')
  )
}

/**
 * 画像だけの段落を figure 要素に変換する。
 * 代替テキストをそのままキャプションとして使うので、素の Markdown としても読める。
 */
export function implicitFigures(md: MarkdownIt): void {
  md.core.ruler.push('mdview_figures', (state: StateCore) => {
    const t = state.tokens
    for (let i = 0; i + 2 < t.length; i++) {
      if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline' || t[i + 2].type !== 'paragraph_close') continue
      const inline = t[i + 1]
      const kids = meaningfulChildren(inline)
      if (kids.length !== 1 || kids[0].type !== 'image') continue

      const img = kids[0]
      const open = t[i]
      open.type = 'figure_open'
      open.tag = 'figure'
      open.attrJoin('class', 'image')
      // {#fig:x} は画像側に付くので figure 側へ移す（参照先は figure であるべき）
      const id = img.attrGet('id')
      if (id != null) {
        open.attrSet('id', String(id))
        img.attrs = (img.attrs ?? []).filter((a) => a[0] !== 'id')
      }
      t[i + 2].type = 'figure_close'
      t[i + 2].tag = 'figure'

      const capOpen = new state.Token('figcaption_open', 'figcaption', 1)
      const capInline = new state.Token('inline', '', 0)
      capInline.content = img.content
      capInline.children = [...(img.children ?? [])]
      capInline.level = inline.level
      const capClose = new state.Token('figcaption_close', 'figcaption', -1)
      t.splice(i + 2, 0, capOpen, capInline, capClose)
      i += 3
    }
    return true
  })
}

/**
 * 表の直前または直後にある `: キャプション` 段落を取り込み、table_open に持たせる。
 * 段落として残しておくと本文の一部に見えてしまうため、トークン列から取り除く。
 */
export function tableCaptions(md: MarkdownIt): void {
  md.core.ruler.push('mdview_table_captions', (state: StateCore) => {
    const t = state.tokens
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'table_open') continue

      // 直前の段落を見る
      let taken = false
      if (i >= 3 && t[i - 1].type === 'paragraph_close' && t[i - 2].type === 'inline' && t[i - 3].type === 'paragraph_open') {
        taken = attachCaption(t[i], t[i - 3], t[i - 2])
        if (taken) {
          t.splice(i - 3, 3)
          i -= 3
        }
      }
      if (taken) continue

      // 直後の段落を見る
      let close = -1
      for (let j = i + 1; j < t.length; j++) {
        if (t[j].type === 'table_close') {
          close = j
          break
        }
      }
      if (close > 0 && t[close + 1]?.type === 'paragraph_open' && t[close + 2]?.type === 'inline' && t[close + 3]?.type === 'paragraph_close') {
        if (attachCaption(t[i], t[close + 1], t[close + 2])) t.splice(close + 1, 3)
      }
    }
    return true
  })
}

function attachCaption(tableOpen: Token, paraOpen: Token, inline: Token): boolean {
  if (!CAPTION_PREFIX.test(inline.content)) return false

  const children = [...(inline.children ?? [])]
  const first = children[0]
  if (first?.type === 'text') first.content = first.content.replace(CAPTION_PREFIX, '')

  const id = paraOpen.attrGet('id')
  if (id != null) tableOpen.attrSet('id', String(id))
  tableOpen.meta = { ...(tableOpen.meta ?? {}), caption: { children } }
  return true
}
