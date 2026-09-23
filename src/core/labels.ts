import type { NumberStyle } from './types.js'

export interface LabelSet {
  /** 最上位見出し（章）の見出し行につける表記。 */
  chapterHeading(n: number): string
  /** 本文から章を参照するときの表記。 */
  chapterRef(n: number): string
  /** 節以下を参照するときの表記。見出し行には番号だけを付ける。 */
  sectionRef(num: string): string
  figure(num: string): string
  table(num: string): string
}

export const LABELS: Record<NumberStyle, LabelSet> = {
  ja: {
    chapterHeading: (n) => `第${n}章`,
    chapterRef: (n) => `第${n}章`,
    sectionRef: (num) => `${num} 節`,
    figure: (num) => `図 ${num}`,
    table: (num) => `表 ${num}`
  },
  en: {
    chapterHeading: (n) => `Chapter ${n}`,
    chapterRef: (n) => `Chapter ${n}`,
    sectionRef: (num) => `Section ${num}`,
    figure: (num) => `Figure ${num}`,
    table: (num) => `Table ${num}`
  }
}
