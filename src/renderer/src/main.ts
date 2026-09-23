import { createParser, parse, renderTokens } from '@core/markdown'
import { sanitizeInPlace } from '@core/sanitize'
import type { DocPayload, Settings } from '@core/types'

const md = createParser()

const el = {
  content: document.getElementById('content') as HTMLElement,
  outline: document.getElementById('outline') as HTMLElement,
  title: document.getElementById('doc-title') as HTMLElement,
  open: document.getElementById('btn-open') as HTMLButtonElement,
  numberMode: document.getElementById('sel-number-mode') as HTMLSelectElement,
  numberStyle: document.getElementById('sel-number-style') as HTMLSelectElement,
  theme: document.getElementById('sel-theme') as HTMLSelectElement
}

let settings: Settings
let doc: DocPayload | null = null

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
  doc = next

  if (!next) {
    el.content.innerHTML = '<div class="empty"><p>Markdown ファイルをドロップ、または <kbd>⌘O</kbd> で開いてください。</p></div>'
    el.outline.replaceChildren()
    el.title.textContent = ''
    return
  }

  const parsed = parse(md, next.content, next.dir)
  const host = document.createElement('div')
  host.className = 'doc'
  host.innerHTML = renderTokens(md, parsed)
  sanitizeInPlace(host)

  el.content.replaceChildren(host)
  el.title.textContent = next.path.replace(/^.*\//, '')
  document.title = `${el.title.textContent} — mdview`
  buildOutline(host)
  el.content.scrollTop = scroll
}

function buildOutline(host: HTMLElement): void {
  const items = host.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  const frag = document.createDocumentFragment()
  for (const h of items) {
    const a = document.createElement('a')
    a.href = `#${h.id}`
    a.className = `lv${h.tagName[1]}`
    a.textContent = h.textContent
    a.addEventListener('click', (e) => {
      e.preventDefault()
      h.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    frag.append(a)
  }
  el.outline.replaceChildren(frag)
}

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
    get doc() {
      return doc
    },
    get settings() {
      return settings
    }
  }
}
