import { describe, expect, it } from 'vitest'
import { renderMath, mathStyleSheet } from '@core/math'
import { renderMd } from './helper.js'

describe('ディスプレイ数式', () => {
  const r = renderMd('$$\nE = mc^2\n$$\n\n$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$\n')

  it('figure に包み、中に SVG を持つ', () => {
    expect(r.html).toContain('<figure class="math" id="eq-1"')
    expect(r.html).toContain('<div class="math-body">')
    expect(r.html).toContain('<svg')
  })

  it('文書内で連番になる', () => {
    expect([...r.html.matchAll(/<figure class="math" id="([^"]+)"/g)].map((m) => m[1])).toEqual(['eq-1', 'eq-2'])
  })

  it('TeX 原文を data-tex に残す（LaTeX コピー用）', () => {
    expect(r.html).toContain('data-tex="E = mc^2"')
  })

  it('data-tex の特殊文字をエスケープする', () => {
    const q = renderMd('$$\na < b \\text{ & "c" }\n$$\n')
    expect(q.html).toContain('&lt;')
    expect(q.html).toContain('&amp;')
    expect(q.html).toContain('&quot;')
    expect(q.html).not.toMatch(/data-tex="[^"]*"c"/)
  })

  it('図番号（図 1.1）の採番対象にはしない', () => {
    // 数式が図として数えられていたら、画像のほうが 図 1.2 になってしまう
    const q = renderMd('# タイトル\n\n## 章\n\n$$\nx = 1\n$$\n\n![図](a.png)\n')
    expect(q.html).toContain('<span class="num num-fig">図 1.1</span> 図')
    expect(q.env.outline.filter((o) => o.kind === 'fig')).toHaveLength(1)
  })
})

describe('インライン数式', () => {
  const r = renderMd('本文 $a^2 + b^2 = c^2$ の途中。\n')

  it('figure にはせず、段落の中に残す', () => {
    expect(r.html).toContain('<p>')
    expect(r.html).not.toContain('figure class="math"')
    expect(r.html).toContain('<eq>')
  })

  it('SVG で描かれる', () => {
    expect(r.html).toContain('<mjx-container')
    expect(r.html).toContain('<svg')
  })
})

describe('SVG の自己完結（fontCache: local）', () => {
  it('グリフの定義が同じ SVG の中にある', () => {
    const svg = renderMath('\\alpha + \\beta', true)
    // use が指す id が、同じ文字列の中で定義されていること
    const refs = [...svg.matchAll(/xlink:href="#([^"]+)"|href="#([^"]+)"/g)].map((m) => m[1] ?? m[2])
    expect(refs.length).toBeGreaterThan(0)
    for (const id of refs) expect(svg).toContain(`id="${id}"`)
  })

  it('外部ファイルを参照しない', () => {
    const svg = renderMath('\\sum_{i=1}^{n} x_i', true)
    expect(svg).not.toMatch(/href="https?:/)
    expect(svg).not.toContain('MJX-SVG-global-cache')
  })
})

describe('壊れた TeX', () => {
  it('例外を投げず、描画を続けられる', () => {
    expect(() => renderMath('\\frac{1}{', true)).not.toThrow()
    const r = renderMd('$$\n\\frac{1}{\n$$\n\n続きの本文。\n')
    expect(r.html).toContain('続きの本文')
    expect(r.html).toContain('<figure class="math"')
  })
})

describe('スタイルシート', () => {
  it('mjx-container の指定を出す', () => {
    expect(mathStyleSheet()).toContain('mjx-container')
  })
})

describe('式番号つきの数式', () => {
  it('$$...$$ (1) の番号を添える', () => {
    const r = renderMd('$$\nE = mc^2\n$$ (1)\n')
    expect(r.html).toContain('<figure class="math" id="eq-1"')
    expect(r.html).toContain('<span class="eqno">(1)</span>')
  })
})
