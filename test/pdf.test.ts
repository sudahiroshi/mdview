import { describe, expect, it } from 'vitest'
import { DOC_PDF_DEFAULTS, buildTemplates, contentBoxPx, marginsInInches, pageSizeFor, type DocPdfOptions } from '@core/pdf'

const opts = (patch: Partial<DocPdfOptions> = {}): DocPdfOptions => ({
  ...DOC_PDF_DEFAULTS,
  title: '実験レポート',
  ...patch
})

/** 3 つの枠（左・中央・右）の中身だけを取り出す。 */
function cells(template: string): [string, string, string] {
  const found = [...template.matchAll(/text-align:(left|center|right);[^>]*>(.*?)<\/div>/g)].map((m) => m[2])
  return [found[0] ?? '', found[1] ?? '', found[2] ?? '']
}

describe('ヘッダー・フッターの組み立て', () => {
  it('文書名を指定した位置と揃えに置く', () => {
    const t = buildTemplates(opts({ titlePlacement: 'header', titleAlign: 'center', pageNumberPlacement: 'none' }))
    expect(cells(t.headerTemplate)[1]).toBe('実験レポート')
    expect(cells(t.headerTemplate)[0]).toBe('')
    expect(t.displayHeaderFooter).toBe(true)
  })

  it('文書名を下部の右揃えにもできる', () => {
    const t = buildTemplates(opts({ titlePlacement: 'footer', titleAlign: 'right', pageNumberPlacement: 'none' }))
    expect(cells(t.footerTemplate)[2]).toBe('実験レポート')
    expect(cells(t.headerTemplate).join('')).toBe('')
  })

  it('ページ番号は Chromium が差し替える印を置く', () => {
    const t = buildTemplates(opts({ titlePlacement: 'none', pageNumberPlacement: 'footer', pageNumberAlign: 'center' }))
    expect(cells(t.footerTemplate)[1]).toBe('<span class="pageNumber"></span>')
  })

  it('総ページ数を添えられる', () => {
    const t = buildTemplates(opts({ titlePlacement: 'none', pageNumberPlacement: 'header', pageNumberAlign: 'right', showTotalPages: true }))
    expect(cells(t.headerTemplate)[2]).toBe('<span class="pageNumber"></span> / <span class="totalPages"></span>')
  })

  it('文書名とページ番号を上下に振り分けられる', () => {
    const t = buildTemplates(opts({ titlePlacement: 'header', titleAlign: 'left', pageNumberPlacement: 'footer', pageNumberAlign: 'right' }))
    expect(cells(t.headerTemplate)[0]).toBe('実験レポート')
    expect(cells(t.footerTemplate)[2]).toBe('<span class="pageNumber"></span>')
  })

  it('同じ位置・同じ揃えに重ねても両方出す', () => {
    const t = buildTemplates(opts({ titlePlacement: 'footer', titleAlign: 'center', pageNumberPlacement: 'footer', pageNumberAlign: 'center' }))
    expect(cells(t.footerTemplate)[1]).toBe('実験レポート <span class="pageNumber"></span>')
  })

  it('どちらも表示しないならヘッダー・フッター自体を出さない', () => {
    const t = buildTemplates(opts({ titlePlacement: 'none', pageNumberPlacement: 'none' }))
    expect(t.displayHeaderFooter).toBe(false)
  })

  it('文書名が空なら位置を指定していても出さない', () => {
    const t = buildTemplates(opts({ title: '   ', titlePlacement: 'header', pageNumberPlacement: 'none' }))
    expect(t.displayHeaderFooter).toBe(false)
  })

  it('文書名の HTML を無害化する', () => {
    const t = buildTemplates(opts({ title: '<script>x</script> & "引用"', titlePlacement: 'header' }))
    expect(t.headerTemplate).toContain('&lt;script&gt;x&lt;/script&gt; &amp; &quot;引用&quot;')
    expect(t.headerTemplate).not.toContain('<script>')
  })

  it('Chromium の既定に流されないよう文字サイズを明示する', () => {
    // 印刷ヘッダーは font-size を指定しないと 0 になり、何も見えなくなる
    expect(buildTemplates(opts()).headerTemplate).toContain('font-size:9pt')
  })
})

describe('余白と用紙', () => {
  it('ヘッダーを使う側は最低限の余白を確保する', () => {
    const m = marginsInInches(opts({ marginMm: 5, titlePlacement: 'header', pageNumberPlacement: 'footer' }))
    expect(m.top).toBeCloseTo(15 / 25.4, 5)
    expect(m.bottom).toBeCloseTo(15 / 25.4, 5)
    expect(m.left).toBeCloseTo(5 / 25.4, 5)
  })

  it('指定した余白が十分ならそのまま使う', () => {
    const m = marginsInInches(opts({ marginMm: 25 }))
    expect(m.top).toBeCloseTo(25 / 25.4, 5)
  })

  it('用紙名はそのまま渡し、B5 だけ実寸に直す', () => {
    expect(pageSizeFor(opts({ pageSize: 'A4' }))).toBe('A4')
    expect(pageSizeFor(opts({ pageSize: 'B5' }))).toEqual({ width: 182 / 25.4, height: 257 / 25.4 })
  })
})

describe('本文が載る領域', () => {
  it('A4 から余白を引いた大きさを CSS ピクセルで返す', () => {
    // 210x297mm から左右上下 20mm ずつ引いた 170x257mm を 96dpi 換算
    expect(contentBoxPx(opts({ pageSize: 'A4', marginMm: 20 }))).toEqual({
      width: Math.round((170 / 25.4) * 96),
      height: Math.round((257 / 25.4) * 96)
    })
  })

  it('ヘッダーのために広げた余白も反映する', () => {
    const narrow = contentBoxPx(opts({ pageSize: 'A4', marginMm: 5, titlePlacement: 'header', pageNumberPlacement: 'footer' }))
    // 上下は 15mm まで広げられるので、左右 5mm より縦が削られる
    expect(narrow.width).toBe(Math.round((200 / 25.4) * 96))
    expect(narrow.height).toBe(Math.round((267 / 25.4) * 96))
  })

  it('用紙ごとに大きさが変わる', () => {
    const a4 = contentBoxPx(opts({ pageSize: 'A4' }))
    const a5 = contentBoxPx(opts({ pageSize: 'A5' }))
    expect(a5.width).toBeLessThan(a4.width)
    expect(a5.height).toBeLessThan(a4.height)
  })
})
