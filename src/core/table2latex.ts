import type { Align, Cell, TableData } from './table.js'

export interface LatexOptions {
  /** longtable は改ページをまたぐ長い表向け。 */
  environment?: 'table' | 'longtable'
  /** 表の配置指定（table 環境のみ）。 */
  placement?: string
  /** 先頭に必要パッケージのコメントを付ける。 */
  preamble?: boolean
}

const DEFAULTS: Required<LatexOptions> = { environment: 'table', placement: 'htbp', preamble: true }

const ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '^': '\\^{}',
  '~': '\\textasciitilde{}'
}

/**
 * TeX の特殊文字を無害化する。
 * 置換結果自身が特殊文字（\textbackslash{} の波括弧など）を含むため、
 * 段階的に replace すると二重変換になる。必ず 1 度の走査で置き換える。
 */
export function escapeLatex(text: string): string {
  return text.replace(/[\\{}$&#_%^~]/g, (c) => ESCAPES[c] ?? c)
}

/** インライントークン列を LaTeX の断片へ変換する。 */
export function cellToLatex(cell: Cell): string {
  const out: string[] = []
  const stack: string[] = []

  for (const t of cell) {
    switch (t.type) {
      case 'text':
        out.push(escapeLatex(t.content))
        break
      case 'code_inline':
        out.push(`\\texttt{${escapeLatex(t.content)}}`)
        break
      case 'math_inline':
      case 'math_inline_double':
        // 数式はそのまま TeX として通す
        out.push(`$${t.content}$`)
        break
      case 'strong_open':
        out.push('\\textbf{')
        stack.push('}')
        break
      case 'em_open':
        out.push('\\emph{')
        stack.push('}')
        break
      case 's_open':
        out.push('\\sout{')
        stack.push('}')
        break
      case 'link_open':
        out.push(`\\href{${(t.attrGet('href') ?? '').toString()}}{`)
        stack.push('}')
        break
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'link_close':
        out.push(stack.pop() ?? '')
        break
      case 'softbreak':
        out.push(' ')
        break
      case 'hardbreak':
        out.push('\\newline ')
        break
      case 'image':
        out.push(escapeLatex(t.content))
        break
      default:
        // html_inline など LaTeX に対応物がないものは中身だけ拾う
        if (t.children) out.push(cellToLatex(t.children))
    }
  }
  // 閉じ忘れ（Markdown 側の不整合）があっても壊れた LaTeX を出さない
  while (stack.length) out.push(stack.pop() as string)
  return out.join('').trim()
}

function rowToLatex(row: Cell[], columns: number): string {
  const cells = Array.from({ length: columns }, (_, i) => cellToLatex(row[i] ?? []))
  return `${cells.join(' & ')} \\\\`
}

function columnSpec(align: Align[], columns: number): string {
  return Array.from({ length: columns }, (_, i) => align[i] ?? 'l').join('')
}

const PREAMBLE = [
  '% 必要なパッケージ: \\usepackage{booktabs}',
  '%   longtable 環境を使う場合: \\usepackage{longtable}',
  '%   リンクを含む場合: \\usepackage{hyperref}',
  '%   取り消し線を含む場合: \\usepackage[normalem]{ulem}'
].join('\n')

/** Markdown の表を booktabs 形式の LaTeX へ変換する。 */
export function tableToLatex(table: TableData, options: LatexOptions = {}): string {
  const opt = { ...DEFAULTS, ...options }
  const columns = Math.max(table.align.length, ...table.head.map((r) => r.length), ...table.body.map((r) => r.length), 1)
  const spec = columnSpec(table.align, columns)
  const caption = table.caption ? cellToLatex(table.caption) : ''
  const label = table.id ? `\\label{${table.id}}` : ''
  const headRows = table.head.map((r) => `    ${rowToLatex(r, columns)}`)
  const bodyRows = table.body.map((r) => `    ${rowToLatex(r, columns)}`)

  const lines: string[] = []
  if (opt.preamble) lines.push(PREAMBLE, '')

  if (opt.environment === 'longtable') {
    lines.push(`\\begin{longtable}{${spec}}`)
    if (caption || label) lines.push(`  \\caption{${caption}}${label} \\\\`)
    lines.push('  \\toprule', ...headRows, '  \\midrule', '  \\endfirsthead')
    lines.push('  \\toprule', ...headRows, '  \\midrule', '  \\endhead')
    lines.push('  \\bottomrule', '  \\endlastfoot')
    lines.push(...bodyRows)
    lines.push('\\end{longtable}')
  } else {
    lines.push(`\\begin{table}[${opt.placement}]`, '  \\centering')
    if (caption) lines.push(`  \\caption{${caption}}`)
    if (label) lines.push(`  ${label}`)
    lines.push(`  \\begin{tabular}{${spec}}`, '    \\toprule')
    if (headRows.length) lines.push(...headRows, '    \\midrule')
    lines.push(...bodyRows, '    \\bottomrule', '  \\end{tabular}', '\\end{table}')
  }

  return lines.join('\n') + '\n'
}
