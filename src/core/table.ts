import type { Token } from 'markdown-it'

export type Align = 'l' | 'c' | 'r'

/** セルの中身はインライントークン列として持つ（強調や数式を保ったまま変換するため）。 */
export type Cell = Token[]

export interface TableData {
  id: string
  /** キャプションのインライントークン列。無指定なら null。 */
  caption: Cell | null
  align: Align[]
  head: Cell[][]
  body: Cell[][]
}

function alignOf(token: Token): Align {
  const style = token.attrGet('style')?.toString() ?? ''
  if (style.includes('center')) return 'c'
  if (style.includes('right')) return 'r'
  return 'l'
}

/**
 * トークン列から表を取り出し、id をキーにした表にする。
 * DOM からではなくトークンから取るのは、太字・コード・数式の区別を保ったまま
 * LaTeX へ変換したいため。
 */
export function extractTables(tokens: Token[]): Map<string, TableData> {
  const out = new Map<string, TableData>()

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'table_open') continue
    const open = tokens[i]
    const id = String(open.attrGet('id') ?? `tbl-${out.size + 1}`)
    const meta = open.meta as { caption?: { children: Token[] } } | undefined

    const head: Cell[][] = []
    const body: Cell[][] = []
    const align: Align[] = []
    let inHead = false
    let row: Cell[] | null = null

    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j]
      if (t.type === 'table_close') {
        i = j
        break
      }
      if (t.type === 'thead_open') inHead = true
      else if (t.type === 'thead_close') inHead = false
      else if (t.type === 'tr_open') row = []
      else if (t.type === 'tr_close') {
        if (row) (inHead ? head : body).push(row)
        row = null
      } else if (t.type === 'th_open' || t.type === 'td_open') {
        if (inHead) align.push(alignOf(t))
        const inline = tokens[j + 1]
        row?.push(inline?.type === 'inline' ? (inline.children ?? []) : [])
      }
    }

    out.set(id, { id, caption: meta?.caption?.children ?? null, align, head, body })
  }

  return out
}
