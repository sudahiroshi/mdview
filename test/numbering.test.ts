import { describe, expect, it } from 'vitest'
import { renderMd, outlineOf } from './helper.js'

const CHAPTERED = `# 序論 {#sec:intro}

本文。

## 背景

![構成図](a.png){#fig:arch}

## 実験

: 条件 {#tbl:cond}

| a | b |
|---|---|
| 1 | 2 |

# 手法 {#sec:method}

![二つ目](b.png){#fig:second}
`

describe('見出しの採番', () => {
  it('H1 は章、H2 以下は連番で表示する', () => {
    const r = renderMd(CHAPTERED)
    expect(r.html).toContain('<span class="num num-sec">第1章</span> 序論')
    expect(r.html).toContain('<span class="num num-sec">1.1</span> 背景')
    expect(r.html).toContain('<span class="num num-sec">1.2</span> 実験')
    expect(r.html).toContain('<span class="num num-sec">第2章</span> 手法')
  })

  it('英文様式では Chapter 表記になる', () => {
    const r = renderMd(CHAPTERED, { style: 'en' })
    expect(r.html).toContain('<span class="num num-sec">Chapter 1</span> 序論')
    expect(r.html).toContain('<span class="num num-sec">1.1</span> 背景')
  })

  it('H1 が無い文書は最上位の見出しを 1 から数える', () => {
    const r = renderMd('## 概要\n\n### 詳細\n\n## まとめ\n')
    expect(outlineOf(r)).toEqual(['sec:1 概要', 'sec:1.1 詳細', 'sec:2 まとめ'])
  })

  it('番号モード none では番号を出さない', () => {
    const r = renderMd(CHAPTERED, { mode: 'none' })
    expect(r.html).not.toContain('num-sec')
    expect(r.html).not.toContain('num-fig')
  })

  it('番号モード headings では図表に番号を付けない', () => {
    const r = renderMd(CHAPTERED, { mode: 'headings' })
    expect(r.html).toContain('num-sec')
    expect(r.html).not.toContain('num-fig')
    expect(r.html).not.toContain('num-tbl')
  })
})

describe('図表の採番', () => {
  it('章がある文書では 章.通番 で数え、章ごとに戻る', () => {
    const r = renderMd(CHAPTERED)
    expect(r.html).toContain('<span class="num num-fig">図 1.1</span> 構成図')
    expect(r.html).toContain('<span class="num num-tbl">表 1.1</span> 条件')
    expect(r.html).toContain('<span class="num num-fig">図 2.1</span> 二つ目')
  })

  it('H1 が無い文書では通し番号になる', () => {
    const r = renderMd('## 概要\n\n![一](a.png){#fig:a}\n\n![二](b.png){#fig:b}\n')
    expect(outlineOf(r)).toEqual(['sec:1 概要', 'fig:図 1 一', 'fig:図 2 二'])
  })

  it('画像だけの段落は figure 要素になり、id は figure 側に付く', () => {
    const r = renderMd('![構成図](a.png){#fig:arch}\n')
    expect(r.html).toContain('<figure class="image" id="fig:arch">')
    expect(r.html).toContain('<figcaption>')
    expect(r.html).not.toContain('<img src="/doc/a.png" alt="構成図" id=')
  })

  it('図式フェンスも図として採番される', () => {
    const r = renderMd('# 章\n\n```mermaid {#fig:flow caption="処理の流れ"}\ngraph TD; A-->B;\n```\n')
    expect(r.html).toContain('data-kind="mermaid"')
    expect(r.html).toContain('id="fig:flow"')
    expect(r.html).toContain('<span class="num num-fig">図 1.1</span> 処理の流れ')
  })

  it('表キャプションは表の直後に置いても取り込まれる', () => {
    const r = renderMd('| a |\n|---|\n| 1 |\n\n: あとがき {#tbl:x}\n')
    expect(r.html).toContain('<caption><span class="num num-tbl">表 1</span> あとがき</caption>')
    expect(r.html).not.toContain('<p>: あとがき</p>')
  })
})

describe('相互参照', () => {
  it('節・図・表への参照を番号付きリンクに置き換える', () => {
    const r = renderMd(`${CHAPTERED}\n参照: [@sec:intro] [@sec:method] [@fig:arch] [@tbl:cond]\n`)
    expect(r.html).toContain('<a class="xref" href="#sec:intro">第1章</a>')
    expect(r.html).toContain('<a class="xref" href="#fig:arch">図 1.1</a>')
    expect(r.html).toContain('<a class="xref" href="#tbl:cond">表 1.1</a>')
  })

  it('節への参照は「節」を伴う', () => {
    const r = renderMd('# 章\n\n## 背景 {#sec:bg}\n\n本文 [@sec:bg]\n')
    expect(r.html).toContain('<a class="xref" href="#sec:bg">1.1 節</a>')
  })

  it('英文様式では Section / Figure 表記になる', () => {
    const r = renderMd('# 章\n\n## 背景 {#sec:bg}\n\n[@sec:bg]\n', { style: 'en' })
    expect(r.html).toContain('>Section 1.1</a>')
  })

  it('未解決の参照は警告表示にする', () => {
    const r = renderMd('本文 [@fig:none] を参照。\n')
    expect(r.html).toContain('<span class="xref-missing"')
    expect(r.html).toContain('[?fig:none]')
  })

  it('番号を出さない設定では参照先の文言を使う', () => {
    const r = renderMd('# 序論 {#sec:intro}\n\n[@sec:intro] を参照。\n', { mode: 'none' })
    expect(r.html).toContain('<a class="xref" href="#sec:intro">序論</a>')
  })

  it('同じ段落に複数の参照があってもすべて置換し、前後の文を保つ', () => {
    const r = renderMd('# 章 {#sec:a}\n\n前 [@sec:a] 中 [@sec:a] 後\n')
    expect(r.html).toContain('前 <a class="xref" href="#sec:a">第1章</a> 中 <a class="xref" href="#sec:a">第1章</a> 後')
  })
})

describe('アウトライン', () => {
  it('キャプションのテキストから属性記法を取り除く', () => {
    const r = renderMd('| a |\n|---|\n| 1 |\n\n: 実験条件 {#tbl:cond}\n')
    expect(outlineOf(r)).toEqual(['tbl:表 1 実験条件'])
  })

  it('見出し・図・表を出現順に並べる', () => {
    const r = renderMd('# 章\n\n![図](a.png)\n\n## 節\n\n: 表題\n\n| a |\n|---|\n| 1 |\n')
    expect(outlineOf(r)).toEqual(['sec:第1章 章', 'fig:図 1.1 図', 'sec:1.1 節', 'tbl:表 1.1 表題'])
  })
})
