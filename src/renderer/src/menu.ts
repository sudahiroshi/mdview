export interface MenuItem {
  label: string
  run: () => void | Promise<void>
}

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
export function showMenu(anchor: HTMLElement, items: MenuItem[]): void {
  close()
  const menu = document.createElement('div')
  menu.className = 'popup-menu'
  for (const item of items) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = item.label
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
