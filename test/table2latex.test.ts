import { describe, expect, it } from 'vitest'
import { escapeLatex, tableToLatex } from '@core/table2latex'
import { renderMd } from './helper.js'

/** Markdown から 1 つ目の表を取り出して LaTeX にする。 */
function toLatex(source: string, options = {}): string {
  const { env } = renderMd(source)
  const table = [...env.tables.values()][0]
  return tableToLatex(table, { preamble: false, ...options })
}

const SAMPLE = `: 実験条件 {#tbl:cond}

| 項目 | 記号 | 値 | 備考 |
|:-----|:----:|---:|:-----|
| 試行回数 | $N$ | 10 | 100% 完了 |
| しきい値 | \`theta\` | 0.5 | a_b & c |
| 補正 | $\\alpha$ | 1.25 | **重要** |
`

describe('escapeLatex', () => {
  it('TeX の特殊文字を退避する', () => {
    expect(escapeLatex('a & b % c # d _ e { f } g $ h')).toBe(
      'a \\& b \\% c \\# d \\_ e \\{ f \\} g \\$ h'
    )
  })

  it('バックスラッシュを最初に処理し、二重変換しない', () => {
    expect(escapeLatex('a\\b')).toBe('a\\textbackslash{}b')
  })

  it('チルダとハット記号を扱う', () => {
    expect(escapeLatex('~ ^')).toBe('\\textasciitilde{} \\^{}')
  })
})

describe('tableToLatex', () => {
  const latex = toLatex(SAMPLE)

  it('booktabs の table 環境を出力する', () => {
    expect(latex).toContain('\\begin{table}[htbp]')
    expect(latex).toContain('\\toprule')
    expect(latex).toContain('\\midrule')
    expect(latex).toContain('\\bottomrule')
    expect(latex).toContain('\\end{table}')
  })

  it('Markdown の列揃えを列指定に反映する', () => {
    expect(latex).toContain('\\begin{tabular}{lcrl}')
  })

  it('キャプションとラベルを出力する', () => {
    expect(latex).toContain('\\caption{実験条件}')
    expect(latex).toContain('\\label{tbl:cond}')
  })

  it('見出し行と本文行を区切る', () => {
    expect(latex).toContain('項目 & 記号 & 値 & 備考 \\\\')
    expect(latex).toContain('試行回数 & $N$ & 10 & 100\\% 完了 \\\\')
  })

  it('インラインコードを \\texttt に、強調を \\textbf にする', () => {
    expect(latex).toContain('\\texttt{theta}')
    expect(latex).toContain('\\textbf{重要}')
  })

  it('数式はエスケープせず TeX として通す', () => {
    expect(latex).toContain('$\\alpha$')
  })

  it('セル内の & と _ を退避する', () => {
    expect(latex).toContain('a\\_b \\& c')
  })

  it('longtable 環境も出力できる', () => {
    const lt = toLatex(SAMPLE, { environment: 'longtable' })
    expect(lt).toContain('\\begin{longtable}{lcrl}')
    expect(lt).toContain('\\endfirsthead')
    expect(lt).toContain('\\endhead')
    expect(lt).toContain('\\endlastfoot')
    expect(lt).toContain('\\end{longtable}')
  })

  it('キャプションが無い表でも出力できる', () => {
    const l = toLatex('| a | b |\n|---|---|\n| 1 | 2 |\n')
    expect(l).not.toContain('\\caption{}')
    expect(l).toContain('a & b \\\\')
  })

  it('欠けたセルを空欄で補う', () => {
    const { env } = renderMd('| a | b |\n|---|---|\n| 1 |\n')
    const l = tableToLatex([...env.tables.values()][0], { preamble: false })
    expect(l).toContain('1 &  \\\\')
  })

  it('preamble を付けると必要パッケージを案内する', () => {
    expect(toLatex(SAMPLE, { preamble: true })).toContain('\\usepackage{booktabs}')
  })
})

describe('キャプション内の相互参照', () => {
  it('解決済みリンクはタグを外して文言だけ残す', () => {
    const { env } = renderMd('# 序論 {#sec:a}\n\n# 手法\n\n: [@sec:a] の条件 {#tbl:x}\n\n| a |\n|---|\n| 1 |\n')
    const l = tableToLatex([...env.tables.values()][0], { preamble: false })
    expect(l).toContain('\\caption{第1章 の条件}')
    expect(l).not.toContain('<a')
  })
})
