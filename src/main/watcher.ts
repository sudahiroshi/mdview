import { watch, type FSWatcher } from 'node:fs'
import { dirname, basename } from 'node:path'

const DEBOUNCE_MS = 120

/**
 * 表示中の .md を監視する。
 * ファイル自身ではなく「親ディレクトリ」を監視しているのは、多くのエディタが
 * 一時ファイルへ書いてから rename する（atomic save）ため、ファイルに張った
 * 監視が保存一回で inode ごと外れてしまうのを避けるため。
 */
export class DocWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private target: string | null = null

  constructor(private readonly onChange: (path: string) => void) {}

  watchFile(path: string): void {
    this.close()
    this.target = path
    const name = basename(path)
    try {
      this.watcher = watch(dirname(path), { persistent: false }, (_event, changed) => {
        if (changed && basename(changed.toString()) !== name) return
        this.schedule()
      })
      this.watcher.on('error', (e) => console.error('ファイル監視エラー:', e))
    } catch (e) {
      console.error('ファイル監視を開始できません:', e)
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.target) this.onChange(this.target)
    }, DEBOUNCE_MS)
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.watcher?.close()
    this.watcher = null
    this.target = null
  }
}
