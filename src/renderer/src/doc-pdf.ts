import { platform } from '../../platform'
import type { Align, DocPdfOptions, PageSize, Placement } from '@core/pdf'
import type { DocPdfSettings, Settings } from '@core/types'

const el = {
  dialog: document.getElementById('pdf-dialog') as HTMLDialogElement,
  form: document.getElementById('pdf-form') as HTMLFormElement,
  title: document.getElementById('pdf-title') as HTMLInputElement,
  pageSize: document.getElementById('pdf-page-size') as HTMLSelectElement,
  margin: document.getElementById('pdf-margin') as HTMLInputElement,
  titlePlace: document.getElementById('pdf-title-place') as HTMLSelectElement,
  titleAlign: document.getElementById('pdf-title-align') as HTMLSelectElement,
  pagePlace: document.getElementById('pdf-page-place') as HTMLSelectElement,
  pageAlign: document.getElementById('pdf-page-align') as HTMLSelectElement,
  total: document.getElementById('pdf-total') as HTMLInputElement,
  cancel: document.getElementById('pdf-cancel') as HTMLButtonElement,
  submit: document.getElementById('pdf-submit') as HTMLButtonElement
}

/**
 * 表示中の本文を、印刷用に持ち出せる HTML 片にする。
 * 書き出しボタンと、表を包むための入れ物は画面のためだけのものなので取り除く。
 */
export function serializeForPrint(host: HTMLElement): string {
  const clone = host.cloneNode(true) as HTMLElement
  for (const bar of clone.querySelectorAll('.export-bar')) bar.remove()
  for (const wrap of clone.querySelectorAll('.export-host')) wrap.replaceWith(...wrap.childNodes)
  return clone.outerHTML
}

/**
 * 文書名の既定値。
 * タイトルとみなされた見出しがあればそれを使う。章見出しは文書名ではないので使わない。
 */
export function defaultTitle(docTitle: string | null, path: string | null): string {
  return docTitle?.trim() || (path ?? '').replace(/^.*\//, '').replace(/\.[^.]+$/, '')
}

export interface DocPdfRequest {
  host: HTMLElement
  docPath: string
  /** 文書タイトルとみなされた見出し（無ければ null）。 */
  docTitle: string | null
  settings: Settings
  /** 設定の変更を保存する。 */
  persist: (patch: Partial<Settings>) => Promise<void>
  /** 書き出しの本体。保存先を返す（取り消しなら null）。 */
  save: (options: DocPdfOptions, html: string) => Promise<string | null>
  notify: (message: string, kind?: 'info' | 'error') => void
}

let busy = false

function readForm(): DocPdfOptions {
  return {
    title: el.title.value,
    pageSize: el.pageSize.value as PageSize,
    marginMm: Math.min(50, Math.max(5, Number(el.margin.value) || 20)),
    titlePlacement: el.titlePlace.value as Placement,
    titleAlign: el.titleAlign.value as Align,
    pageNumberPlacement: el.pagePlace.value as Placement,
    pageNumberAlign: el.pageAlign.value as Align,
    showTotalPages: el.total.checked
  }
}

function fillForm(saved: DocPdfSettings, title: string): void {
  el.title.value = title
  el.pageSize.value = saved.pageSize
  el.margin.value = String(saved.marginMm)
  el.titlePlace.value = saved.titlePlacement
  el.titleAlign.value = saved.titleAlign
  el.pagePlace.value = saved.pageNumberPlacement
  el.pageAlign.value = saved.pageNumberAlign
  el.total.checked = saved.showTotalPages
  syncEnabled()
}

/** 「表示しない」を選んだ側は、揃えを選べても意味がないので触れなくする。 */
function syncEnabled(): void {
  el.titleAlign.disabled = el.titlePlace.value === 'none'
  el.title.disabled = el.titlePlace.value === 'none'
  el.pageAlign.disabled = el.pagePlace.value === 'none'
  el.total.disabled = el.pagePlace.value === 'none'
}

el.titlePlace.addEventListener('change', syncEnabled)
el.pagePlace.addEventListener('change', syncEnabled)
el.cancel.addEventListener('click', () => el.dialog.close())

export function openDocPdfDialog(req: DocPdfRequest): void {
  if (busy) return
  fillForm(req.settings.docPdf, defaultTitle(req.docTitle, req.docPath))

  const onSubmit = async (e: Event): Promise<void> => {
    e.preventDefault()
    const options = readForm()
    const { title: _title, ...persistable } = options
    void req.persist({ docPdf: persistable })

    const html = serializeForPrint(req.host)

    // 印刷ダイアログを使う環境では、こちらのダイアログを先に閉じる。
    // 書き出しの完了は印刷が終わるまで返ってこないため、開いたままだと固まって見える。
    if (!platform.capabilities.directPdf) {
      el.dialog.close()
      req.notify('印刷ダイアログを開きました。送り先に「PDF として保存」を選んでください。')
      try {
        await req.save(options, html)
      } catch (err) {
        req.notify(`PDF の書き出しに失敗しました: ${(err as Error).message}`, 'error')
      }
      return
    }

    busy = true
    el.submit.disabled = true
    el.submit.textContent = '作成中…'
    try {
      const saved = await req.save(options, html)
      el.dialog.close()
      if (saved) req.notify(`保存しました: ${saved.replace(/^.*\//, '')}`)
    } catch (err) {
      req.notify(`PDF の書き出しに失敗しました: ${(err as Error).message}`, 'error')
    } finally {
      busy = false
      el.submit.disabled = false
      el.submit.textContent = '書き出す'
    }
  }

  el.form.addEventListener('submit', onSubmit, { once: true })
  el.dialog.addEventListener('close', () => el.form.removeEventListener('submit', onSubmit), { once: true })
  el.dialog.showModal()
}
