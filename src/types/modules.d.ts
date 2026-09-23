// 型定義を同梱していない markdown-it プラグインの最小宣言
declare module 'markdown-it-texmath' {
  import type { MarkdownIt } from 'markdown-it'
  interface TexmathOptions {
    engine: unknown
    delimiters?: string | string[]
    katexOptions?: Record<string, unknown>
  }
  const plugin: (md: MarkdownIt, options?: TexmathOptions) => void
  export default plugin
}

// @plantuml/core（TeaVM で JS 化された PlantUML 本体）は型定義を同梱していない
declare module '@plantuml/core' {
  /** PlantUML のソース行を SVG 文字列にする。描画は非同期。 */
  export function renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void
  ): void
  /** 指定 id の要素へ直接描き込む版。本アプリでは使わない。 */
  export function render(lines: string[], targetId: string, options?: { dark?: boolean }): void
}

/** Graphviz（Viz.js）を globalThis.Viz として用意する副作用だけのモジュール。 */
declare module '@plantuml/core/viz-global.js'
/** globalThis.PLANTUML_THEMES に !theme の定義を登録する副作用だけのモジュール。 */
declare module '@plantuml/core/themes.js'
