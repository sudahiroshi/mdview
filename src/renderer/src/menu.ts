export interface MenuItem {
  label: string
  run: () => void | Promise<void>
  /** 補足（書き出される実寸など）。右側に控えめに出す。 */
  note?: string
  /** 入／切を持つ項目。true のとき印を付ける。 */
  checked?: boolean
}

/** 項目のあいだに引く区切り線。 */
export const SEPARATOR = { separator: true } as const

export type MenuEntry = MenuItem | typeof SEPARATOR

let open: HTMLElement | null = null

function close(): void {
  open?.remove()
  open = null
}

document.addEventListener('pointerdown', (e) => {
  if (open && !open.contains(e.target as Node)) close()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close()
})
window.addEventListener('resize', close)
document.addEventListener('scroll', close, true)

/** ボタンの直下に小さな選択メニューを出す。書き出しの細かい選択肢をツールバーから追い出すため。 */
export function showMenu(anchor: HTMLElement, items: MenuEntry[]): void {
  close()
  const menu = document.createElement('div')
  menu.className = 'popup-menu'
  for (const item of items) {
    if ('separator' in item) {
      menu.append(document.createElement('hr'))
      continue
    }
    const b = document.createElement('button')
    b.type = 'button'
    if (item.checked !== undefined) b.classList.add(item.checked ? 'on' : 'off')
    const label = document.createElement('span')
    label.textContent = item.label
    b.append(label)
    if (item.note) {
      const note = document.createElement('span')
      note.className = 'note'
      note.textContent = item.note
      b.append(note)
    }
    b.addEventListener('click', () => {
      close()
      void item.run()
    })
    menu.append(b)
  }
  document.body.append(menu)

  const r = anchor.getBoundingClientRect()
  const mr = menu.getBoundingClientRect()
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - mr.width - 8))}px`
  menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - mr.height - 8)}px`
  open = menu
}
