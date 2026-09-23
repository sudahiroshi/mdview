import type { DocPayload, SaveRequest, Settings } from '../core/types.js'
import type { DocPdfOptions } from '../core/pdf.js'

export type { DocPayload, SaveRequest, Settings }

/**
 * 実行環境によって出来ることが違うので、画面側はこれを見て挙動を変える。
 * デスクトップ版は全部できるが、ブラウザ版はブラウザの持つ API に縛られる。
 */
export interface Capabilities {
  /** 保存先を選ばせられるか。false のときはダウンロードとして落ちる。 */
  chooseSaveLocation: boolean
  /** 相対パスで書かれた画像を解決できるか。 */
  relativeImages: boolean
  /** 保存を検知して自動で読み直せるか。 */
  watch: boolean
  /** PDF をその場で書き出せるか。false のときは印刷ダイアログを経由する。 */
  directPdf: boolean
}

/** 画面側が使う唯一の窓口。Electron 版とブラウザ版がそれぞれ実装する。 */
export interface Platform {
  readonly kind: 'electron' | 'web'
  readonly capabilities: Capabilities
  /** この環境で使えない機能の案内。無ければ null。 */
  readonly limitation: string | null

  /** ファイルを選んで開く。取り消されたら null。 */
  openDialog(): Promise<DocPayload | null>
  /** ドロップされたファイルを開く。 */
  openDropped(file: File): Promise<DocPayload | null>
  /** パスを指定して開く。ブラウザ版にはパスの概念が無いので省略される。 */
  loadPath?(path: string): Promise<DocPayload>

  /** 相対パスの画像を、画面に出せる URL に直す。解決できなければ null。 */
  resolveImage(dir: string, src: string): Promise<string | null>

  save(req: SaveRequest, data: Uint8Array | string): Promise<string | null>
  savePdf(req: SaveRequest, svg: string, width: number, height: number): Promise<string | null>
  saveDocumentPdf(req: SaveRequest, html: string, options: DocPdfOptions): Promise<string | null>
  copyText(text: string): Promise<void>

  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>

  /** 外から文書が開かれたとき（メニュー操作など）。 */
  onDocOpened(cb: (doc: DocPayload) => void): () => void
  /** 表示中の文書が書き換わったとき。 */
  onDocChanged(cb: (doc: DocPayload) => void): () => void
  /** 文書全体の PDF 書き出しを求められたとき。 */
  onRequestDocPdf(cb: () => void): () => void
}
