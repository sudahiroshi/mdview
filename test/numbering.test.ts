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
    const r = renderMd('# タイトル\n\n## 章\n\n```mermaid {#fig:flow caption="処理の流れ"}\ngraph TD; A-->B;\n```\n')
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
    const r = renderMd('# タイトル\n\n## 章\n\n### 背景 {#sec:bg}\n\n本文 [@sec:bg]\n')
    expect(r.html).toContain('<a class="xref" href="#sec:bg">1.1 節</a>')
  })

  it('英文様式では Section / Figure 表記になる', () => {
    const r = renderMd('# タイトル\n\n## 章\n\n### 背景 {#sec:bg}\n\n[@sec:bg]\n', { style: 'en' })
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
    const r = renderMd('# 序論 {#sec:a}\n\n# 手法\n\n前 [@sec:a] 中 [@sec:a] 後\n')
    expect(r.html).toContain('前 <a class="xref" href="#sec:a">第1章</a> 中 <a class="xref" href="#sec:a">第1章</a> 後')
  })
})

describe('アウトライン', () => {
  it('キャプションのテキストから属性記法を取り除く', () => {
    const r = renderMd('| a |\n|---|\n| 1 |\n\n: 実験条件 {#tbl:cond}\n')
    expect(outlineOf(r)).toEqual(['tbl:表 1 実験条件'])
  })

  it('見出し・図・表を出現順に並べる', () => {
    const r = renderMd('# 序論\n\n![図](a.png)\n\n## 節\n\n: 表題\n\n| a |\n|---|\n| 1 |\n\n# 手法\n')
    expect(outlineOf(r)).toEqual(['sec:第1章 序論', 'fig:図 1.1 図', 'sec:1.1 節', 'tbl:表 1.1 表題', 'sec:第2章 手法'])
  })
})

describe('冒頭の単独 H1 をタイトルとして扱う', () => {
  const README = `# mdview

概要の文。

## 使い方 {#sec:usage}

### 起動

![画面](a.png){#fig:shot}

## 設計

: 構成 {#tbl:parts}

| 層 | 役割 |
|---|---|
| core | 変換 |
`

  it('タイトルには番号を付けず、H2 から章として数える', () => {
    const r = renderMd(README)
    expect(r.html).toContain('<h1 id="mdview">mdview</h1>')
    expect(r.html).toContain('<span class="num num-sec">第1章</span> 使い方')
    expect(r.html).toContain('<span class="num num-sec">1.1</span> 起動')
    expect(r.html).toContain('<span class="num num-sec">第2章</span> 設計')
  })

  it('図表も H2 を章として採番する', () => {
    const r = renderMd(README)
    expect(r.html).toContain('<span class="num num-fig">図 1.1</span> 画面')
    expect(r.html).toContain('<span class="num num-tbl">表 2.1</span> 構成')
  })

  it('タイトルはアウトラインに番号なしで載る', () => {
    expect(outlineOf(renderMd(README))[0]).toBe('sec:mdview')
  })

  it('タイトルへの参照は見出しの文言になる', () => {
    const r = renderMd(`${README}\n本稿 [@mdview] と [@sec:usage]\n`)
    expect(r.html).toContain('<a class="xref" href="#mdview">mdview</a>')
    expect(r.html).toContain('<a class="xref" href="#sec:usage">第1章</a>')
  })

  it('H1 が複数ある文書は従来どおり H1 を章として数える', () => {
    const r = renderMd('# 序論\n\n## 背景\n\n# 手法\n')
    expect(r.html).toContain('<span class="num num-sec">第1章</span> 序論')
    expect(r.html).toContain('<span class="num num-sec">1.1</span> 背景')
    expect(r.html).toContain('<span class="num num-sec">第2章</span> 手法')
  })

  it('H1 が 1 つでも冒頭でなければ章として数える', () => {
    const r = renderMd('## 前書き\n\n# 序論\n\n## 背景\n')
    expect(outlineOf(r)).toEqual(['sec:1.1 前書き', 'sec:第2章 序論', 'sec:2.1 背景'])
  })

  it('章より前に図があるときは文書全体を通し番号にする', () => {
    // 「図 1」と「図 1.1」が同じ文書に混ざらないようにするための決まり
    const r = renderMd('# タイトル\n\n![前置き](a.png)\n\n## 章\n\n![本文](b.png)\n')
    expect(outlineOf(r)).toEqual(['sec:タイトル', 'fig:図 1 前置き', 'sec:第1章 章', 'fig:図 2 本文'])
  })

  it('英文様式でもタイトルは無番号のままにする', () => {
    const r = renderMd(README, { style: 'en' })
    expect(r.html).toContain('<h1 id="mdview">mdview</h1>')
    expect(r.html).toContain('<span class="num num-sec">Chapter 1</span> 使い方')
  })
})

describe('自動採番の id', () => {
  it('章をまたいでも図表の id が重複しない', () => {
    const src = '# 第1\n\n![a](a.png)\n\n![b](b.png)\n\n# 第2\n\n![c](c.png)\n'
    const ids = [...renderMd(src).html.matchAll(/<figure class="image" id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['fig-1', 'fig-2', 'fig-3'])
  })

  it('表の id も章をまたいで重複しない', () => {
    const src = '# 第1\n\n| a |\n|---|\n| 1 |\n\n# 第2\n\n| b |\n|---|\n| 2 |\n'
    const ids = [...renderMd(src).html.matchAll(/<table id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toEqual(['tbl-1', 'tbl-2'])
  })

  it('番号もキャプションも無い図表はアウトラインに載せない', () => {
    const r = renderMd('## 節\n\n| a |\n|---|\n| 1 |\n', { mode: 'headings' })
    expect(outlineOf(r)).toEqual(['sec:1 節'])
  })
})
