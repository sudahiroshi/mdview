// tako:run: npx electron tools/make-icon.mjs
// SVG から macOS 用の .icns を作る。
// rsvg-convert などの外部変換器が無い環境でも動くよう、描画は Electron の canvas に任せる。
//
//   npx electron tools/make-icon.mjs [入力.svg] [出力.icns]
import { app, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.mjs'))
const srcSvg = resolve(args[0] ?? join(root, 'build', 'icon.svg'))
const outIcns = resolve(args[1] ?? join(root, 'build', 'icon.icns'))

/** .icns に必要な（論理サイズ, 実ピクセル）の組み合わせ。 */
const VARIANTS = [16, 32, 128, 256, 512].flatMap((n) => [
  { name: `icon_${n}x${n}.png`, px: n },
  { name: `icon_${n}x${n}@2x.png`, px: n * 2 }
])

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    const svg = await readFile(srcSvg, 'utf8')

    // 空のローカルページを介するのは、data: URL だと loadURL が返ってこない場合があるため
    const page = join(tmpdir(), 'mdview-make-icon.html')
    await writeFile(page, '<!doctype html><meta charset="utf-8"><body style="margin:0"></body>')
    const win = new BrowserWindow({ show: false, width: 200, height: 200 })
    await win.loadFile(page)

    const iconset = join(dirname(outIcns), 'icon.iconset')
    await rm(iconset, { recursive: true, force: true })
    await mkdir(iconset, { recursive: true })

    for (const v of VARIANTS) {
      const dataUrl = await win.webContents.executeJavaScript(`(async () => {
        const url = URL.createObjectURL(new Blob([${JSON.stringify(svg)}], { type: 'image/svg+xml;charset=utf-8' }))
        try {
          const img = new Image()
          img.width = ${v.px}
          img.height = ${v.px}
          await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('SVG を読み込めません')); img.src = url })
          const c = document.createElement('canvas')
          c.width = ${v.px}; c.height = ${v.px}
          c.getContext('2d').drawImage(img, 0, 0, ${v.px}, ${v.px})
          return c.toDataURL('image/png')
        } finally { URL.revokeObjectURL(url) }
      })()`)
      await writeFile(join(iconset, v.name), Buffer.from(dataUrl.split(',')[1], 'base64'))
    }

    await run('iconutil', ['-c', 'icns', iconset, '-o', outIcns])
    await rm(iconset, { recursive: true, force: true })
    console.log(`書き出しました: ${outIcns}`)
  } catch (e) {
    console.error('アイコンの生成に失敗しました:', e)
    app.exit(1)
    return
  }
  app.exit(0)
})
