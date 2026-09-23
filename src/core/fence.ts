export type DiagramKind = 'mermaid' | 'graphviz' | 'plantuml'

const KINDS: Record<string, DiagramKind> = {
  mermaid: 'mermaid',
  dot: 'graphviz',
  graphviz: 'graphviz',
  neato: 'graphviz',
  plantuml: 'plantuml',
  puml: 'plantuml',
  uml: 'plantuml'
}

export function diagramKindOf(lang: string): DiagramKind | null {
  return KINDS[lang.toLowerCase()] ?? null
}

export interface FenceInfo {
  lang: string
  id: string | null
  caption: string | null
}

/**
 * フェンスの info 文字列を解析する。
 * 例: `mermaid {#fig:flow caption="全体の処理フロー"}`
 * markdown-it-attrs が先に {...} を取り除く場合もあるため、属性が無い形も許す。
 */
export function parseFenceInfo(info: string): FenceInfo {
  const text = info.trim()
  const brace = text.indexOf('{')
  const lang = (brace >= 0 ? text.slice(0, brace) : text).trim().split(/\s+/)[0] ?? ''
  if (brace < 0) return { lang, id: null, caption: null }

  const body = text.slice(brace + 1).replace(/\}\s*$/, '')
  const id = /(?:^|\s)#([^\s"'{}]+)/.exec(body)?.[1] ?? null
  const caption =
    /(?:^|\s)caption\s*=\s*"([^"]*)"/.exec(body)?.[1] ??
    /(?:^|\s)caption\s*=\s*'([^']*)'/.exec(body)?.[1] ??
    /(?:^|\s)caption\s*=\s*([^\s}]+)/.exec(body)?.[1] ??
    null
  return { lang, id, caption }
}
