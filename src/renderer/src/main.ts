import { createParser, parse, renderTokens } from '@core/markdown'
import { mathStyleSheet } from '@core/math'
import { sanitizeInPlace } from '@core/sanitize'
import { renderDiagrams } from './diagrams'
import { showMenu, type MenuEntry } from './menu'
import { openDocPdfDialog, serializeForPrint } from './doc-pdf'
import { copyTableLatex, exportPdf, exportPng, exportSvg, saveTableLatex, snapshotSvg, toPngBytes, type ExportContext } from './export'
import type { TableData } from '@core/table'
import type { OutlineItem } from '@core/numbering'
import type { DocPayload, Settings } from '@core/types'

const md = createParser()

const el = {
  content: document.getElementById('content') as HTMLElement,
  outline: document.getElementById('outline') as HTMLElement,
  title: document.getElementById('doc-title') as HTMLElement,
  open: document.getElementById('btn-open') as HTMLButtonElement,
  docPdf: document.getElementById('btn-doc-pdf') as HTMLButtonElement,
  numberMode: document.getElementById('sel-number-mode') as HTMLSelectElement,
  numberStyle: document.getElementById('sel-number-style') as HTMLSelectElement,
  theme: document.getElementById('sel-theme') as HTMLSelectElement
}

let settings: Settings
let doc: DocPayload | null = null
/** 図式の非同期描画が、すでに差し替わった文書へ書き戻すのを防ぐための世代番号。 */
let generation = 0
/** 直近の解析結果のうち、書き出しで必要になるもの。 */
let docTitle: string | null = null

/* ---------------- テーマ ---------------- */

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(): void {
  const mode = settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme
  document.documentElement.dataset['theme'] = mode
}

systemDark.addEventListener('change', () => {
  if (settings.theme === 'system') applyTheme()
})

/* ---------------- 描画 ---------------- */

function render(next: DocPayload | null, opts: { keepScroll?: boolean } = {}): void {
  const scroll = opts.keepScroll ? el.content.scrollTop : 0
  const gen = ++generation
  doc = next

  el.docPdf.disabled = !next

  if (!next) {
    el.content.innerHTML = '<div class="empty"><p>Markdown ファイルをドロップ、または <kbd>⌘O</kbd> で開いてください。</p></div>'
    el.outline.replaceChildren()
    el.title.textContent = ''
    return
  }

  const parsed = parse(md, next.content, next.dir, { mode: settings.numberMode, style: settings.numberStyle })
  const host = document.createElement('div')
  host.className = 'doc'
  host.innerHTML = renderTokens(md, parsed)
  sanitizeInPlace(host)

  el.content.replaceChildren(host)
  exportCtx.docPath = next.path
  attachTableBars(host, parsed.env.tables)
  attachFigureBars(host)
  el.title.textContent = next.path.replace(/^.*\//, '')
  document.title = `${el.title.textContent} — mdview`
  docTitle = parsed.env.docTitle
  buildOutline(parsed.env.outline)
  el.content.scrollTop = scroll

  void renderDiagrams(host, parsed.env.diagrams).then(() => {
    if (gen !== generation) return
    // 図が描き上がってから、SVG を持つ図にだけボタンを付ける
    attachFigureBars(host)
    // 図の高さが確定してから位置を合わせ直す
    el.content.scrollTop = scroll
  })
}

function buildOutline(items: OutlineItem[]): void {
  const frag = document.createDocumentFragment()
  for (const item of items) {
    const a = document.createElement('a')
    a.href = `#${item.id}`
    a.className = item.kind === 'sec' ? `lv${Math.min(item.level, 6)}` : item.kind
    a.textContent = [item.number, item.text].filter(Boolean).join(' ') || item.id
    a.addEventListener('click', (e) => {
      e.preventDefault()
      document.getElementById(item.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    frag.append(a)
  }
  el.outline.replaceChildren(frag)
}

/** 本文中の相互参照リンクを、ページ内スクロールとして処理する。 */
el.content.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest?.('a.xref') as HTMLAnchorElement | null
  if (!a) return
  e.preventDefault()
  document.getElementById(decodeURIComponent(a.getAttribute('href')!.slice(1)))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
})

/* ---------------- 書き出し ---------------- */

const exportCtx: ExportContext = { docPath: null }

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  const el2 = document.createElement('div')
  el2.className = `toast ${kind}`
  el2.textContent = message
  document.body.append(el2)
  setTimeout(() => el2.remove(), kind === 'error' ? 6000 : 2600)
}

/** 書き出し処理を包んで、結果をまとめて通知する。 */
async function run(label: string, task: () => Promise<string | null | void>): Promise<void> {
  try {
    const saved = await task()
    if (saved === null) return // 保存ダイアログを取り消した
    toast(typeof saved === 'string' ? `保存しました: ${saved.replace(/^.*\//, '')}` : `${label}をコピーしました`)
  } catch (e) {
    toast(`${label}に失敗しました: ${(e as Error).message}`, 'error')
  }
}

function bar(...buttons: HTMLElement[]): HTMLElement {
  const el2 = document.createElement('div')
  el2.className = 'export-bar'
  el2.append(...buttons)
  return el2
}

function button(label: string, onClick: (btn: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', () => onClick(b))
  return b
}

/** 描画の済んだ図に、その図だけを書き出すためのボタンを付ける。 */
function attachFigureBars(host: HTMLElement): void {
  for (const fig of host.querySelectorAll<HTMLElement>('figure.diagram, figure.math')) {
    if (!fig.querySelector('svg') || fig.querySelector(':scope > .export-bar')) continue
    measureSvg(fig)
    const tex = fig.dataset['tex']
    fig.append(
      bar(
        button('PNG', (b) => showMenu(b, pngMenu(fig))),
        pdfButton(fig),
        button('SVG', () =>
          void run('SVG 書き出し', () => exportSvg(exportCtx, fig, { transparent: settings.exportTransparent }))
        ),
        // 数式は画像より TeX のほうが使い道が多いので、原文もコピーできるようにする
        ...(tex ? [button('LaTeX', () => void run('LaTeX', () => window.api.copyText(tex)))] : []),
        backgroundButton(host)
      )
    )
  }
}

const PNG_SCALES = [1, 2, 3, 4, 6, 8, 12]
/** これを超える PNG は書き出しに耐えないので選択肢から外す。 */
const PNG_MAX_SIDE = 8192
const PNG_MAX_PIXELS = 40_000_000

/**
 * PNG の倍率メニュー。
 * 数式のように元が小さいものは高い倍率が要る一方、大きな図で 12 倍を選ぶと
 * 数千万画素になってしまう。書き出される実寸を添えて、無理な倍率は出さない。
 */
function pngMenu(fig: HTMLElement): MenuEntry[] {
  const w = Number(fig.dataset['width']) || 0
  const h = Number(fig.dataset['height']) || 0
  const entries: MenuEntry[] = []

  for (const scale of PNG_SCALES) {
    const pw = Math.round(w * scale)
    const ph = Math.round(h * scale)
    const tooBig = pw > PNG_MAX_SIDE || ph > PNG_MAX_SIDE || pw * ph > PNG_MAX_PIXELS
    // 等倍だけは、どれだけ大きくても選べるようにしておく
    if (w && h && tooBig && scale !== 1) continue
    entries.push({
      label: scale === 1 ? '等倍' : `${scale} 倍`,
      ...(w && h ? { note: `${pw} × ${ph}` } : {}),
      run: () =>
        run('PNG 書き出し', () => exportPng(exportCtx, fig, { scale, transparent: settings.exportTransparent }))
    })
  }

  return entries
}

/**
 * 書き出しの背景を切り替えるボタン。
 * PNG と SVG に共通の指定なので、メニューの中ではなくバーに出して
 * 今どちらなのかが常に見えるようにする。
 */
/**
 * PDF は必ず白背景になる（Chromium の書き出しがページ全面を塗るため）。
 * 透過を選んでいるときは、白で出たことがその場で分かるようにしておく。
 */
function pdfButton(fig: HTMLElement): HTMLButtonElement {
  const b = button('PDF', () => {
    void (async () => {
      try {
        const saved = await exportPdf(exportCtx, fig)
        if (saved === null) return
        const name = saved.replace(/^.*\//, '')
        toast(settings.exportTransparent ? `保存しました: ${name}（PDF は白背景）` : `保存しました: ${name}`)
      } catch (e) {
        toast(`PDF 書き出しに失敗しました: ${(e as Error).message}`, 'error')
      }
    })()
  })
  b.title = 'PDF は常に白背景になる（透過が要るときは SVG か PNG）'
  return b
}

function backgroundLabel(): string {
  return settings.exportTransparent ? '背景:透過' : '背景:白'
}

function backgroundButton(host: HTMLElement): HTMLButtonElement {
  const b = button(backgroundLabel(), () => {
    void (async () => {
      settings = await window.api.setSettings({ exportTransparent: !settings.exportTransparent })
      // 文書中のボタンの表示だけを更新する。バーごと作り直すと、
      // 同じ入れ物にいる表の LaTeX ボタンまで巻き添えで消えてしまう
      for (const t of host.querySelectorAll('.export-bar button.toggle')) t.textContent = backgroundLabel()
      toast(settings.exportTransparent ? '書き出しの背景を透過にしました' : '書き出しの背景を白にしました')
    })()
  })
  b.classList.add('toggle')
  b.title = 'PNG と SVG に書き出すときの背景（PDF は常に白）'
  return b
}

/**
 * 書き出しに必要な実寸を図に持たせる。
 * 図式は描画時に viewBox から入れているが、数式の SVG は寸法を ex 単位で書くので
 * viewBox からは px が出ない。表示されている大きさをそのまま測る。
 */
function measureSvg(fig: HTMLElement): void {
  if (fig.dataset['width']) return
  const svg = fig.querySelector('svg')
  if (!svg) return
  const r = svg.getBoundingClientRect()
  if (r.width > 0 && r.height > 0) {
    fig.dataset['width'] = String(Math.round(r.width))
    fig.dataset['height'] = String(Math.round(r.height))
  }
}

/** 表に LaTeX 書き出しのボタンを付ける。 */
function attachTableBars(host: HTMLElement, tables: Map<string, TableData>): void {
  for (const table of host.querySelectorAll<HTMLTableElement>('table[id]')) {
    const data = tables.get(table.id)
    if (!data) continue
    // 表自体を包む要素が無いとボタンを重ねて置けない
    const wrap = document.createElement('div')
    wrap.className = 'export-host'
    table.parentNode?.insertBefore(wrap, table)
    wrap.append(table)
    wrap.append(
      bar(
        button('LaTeX', (b) =>
          showMenu(b, [
            { label: 'コピー（table）', run: () => run('LaTeX', () => copyTableLatex(data, {})) },
            { label: '.tex に保存（table）', run: () => run('LaTeX 書き出し', () => saveTableLatex(exportCtx, data, {})) },
            { label: 'コピー（longtable）', run: () => run('LaTeX', () => copyTableLatex(data, { environment: 'longtable' })) },
            { label: '.tex に保存（longtable）', run: () => run('LaTeX 書き出し', () => saveTableLatex(exportCtx, data, { environment: 'longtable' })) }
          ])
        )
      )
    )
  }
}

/** 文書全体を PDF にする。書き出し条件はダイアログで決める。 */
function requestDocPdf(): void {
  const host = el.content.querySelector<HTMLElement>('.doc')
  if (!host || !doc) return
  const current = doc
  const base = current.path.replace(/^.*\//, '').replace(/\.[^.]+$/, '')
  openDocPdfDialog({
    host,
    docPath: current.path,
    docTitle,
    settings,
    persist: async (patch) => {
      settings = await window.api.setSettings(patch)
    },
    save: (options, html) =>
      window.api.saveDocumentPdf(
        { defaultName: `${base}.pdf`, dir: current.dir, extensions: ['pdf'], filterName: 'PDF 文書' },
        html,
        options
      ),
    notify: toast
  })
}

el.docPdf.addEventListener('click', requestDocPdf)
window.api.onRequestDocPdf(requestDocPdf)

/* ---------------- ファイルを開く ---------------- */

async function openPath(path: string): Promise<void> {
  try {
    render(await window.api.load(path))
  } catch (e) {
    console.error(e)
    alert(`開けません: ${path}\n${(e as Error).message}`)
  }
}

el.open.addEventListener('click', () => {
  void window.api.openDialog().then((d) => d && render(d))
})

window.api.onDocOpened((d) => render(d))
window.api.onDocChanged((d) => render(d, { keepScroll: d.path === doc?.path }))

document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

document.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file) void openPath(window.api.pathForFile(file))
})

/* ---------------- 設定 UI ---------------- */

async function updateSettings(patch: Partial<Settings>): Promise<void> {
  settings = await window.api.setSettings(patch)
  applyTheme()
  if (doc) render(doc, { keepScroll: true })
}

el.numberMode.addEventListener('change', () => void updateSettings({ numberMode: el.numberMode.value as Settings['numberMode'] }))
el.numberStyle.addEventListener('change', () => void updateSettings({ numberStyle: el.numberStyle.value as Settings['numberStyle'] }))
el.theme.addEventListener('change', () => void updateSettings({ theme: el.theme.value as Settings['theme'] }))

async function init(): Promise<void> {
  // liteAdaptor を使っていると MathJax が自分でスタイルを入れないので、ここで一度だけ入れる
  const mathCss = document.createElement('style')
  mathCss.textContent = mathStyleSheet()
  document.head.append(mathCss)

  settings = await window.api.getSettings()
  el.numberMode.value = settings.numberMode
  el.numberStyle.value = settings.numberStyle
  el.theme.value = settings.theme
  applyTheme()
}

void init()

// 開発ビルドでのみ、DevTools Protocol からの動作検証用に内部状態を公開する
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>)['__mdview'] = {
    open: openPath,
    render,
    exportCtx,
    snapshotSvg,
    toPngBytes,
    exportPng,
    exportPdf,
    exportSvg,
    serializeForPrint,
    get doc() {
      return doc
    },
    get settings() {
      return settings
    }
  }
}
