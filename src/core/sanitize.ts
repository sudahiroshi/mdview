const FORBIDDEN_TAGS = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FORM'])

/**
 * 生 HTML 混じりの Markdown を許しているため、DOM へ差し込む前に危険な要素を落とす。
 * 自分の書いた文書が対象とはいえ、外から貰った .md をそのまま開くこともあるため。
 */
export function sanitizeInPlace(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (FORBIDDEN_TAGS.has(el.tagName)) {
      el.remove()
      continue
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name)
      }
    }
  }
}
