import { createParser, parse, renderTokens, type ParsedDoc } from '@core/markdown'
import type { NumberingOptions } from '@core/numbering'

export interface Rendered {
  html: string
  env: ParsedDoc['env']
}

export function renderMd(source: string, numbering: Partial<NumberingOptions> = {}): Rendered {
  const md = createParser()
  const doc = parse(md, source, '/doc', { mode: 'full', style: 'ja', ...numbering })
  return { html: renderTokens(md, doc), env: doc.env }
}

/** アウトラインを「番号 テキスト」の配列にして読みやすくする。 */
export function outlineOf(r: Rendered): string[] {
  return r.env.outline.map((o) => `${o.kind}:${[o.number, o.text].filter(Boolean).join(' ')}`)
}
