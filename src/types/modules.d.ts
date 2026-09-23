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
