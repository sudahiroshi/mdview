// tako:run: node tools/serve-web.mjs
// ブラウザ版（dist-web/）を配る小さな静的サーバ。追加の依存は使わない。
//
//   node tools/serve-web.mjs [ポート] [配るディレクトリ]
//
// localhost は安全なオリジンとして扱われるので、HTTP のままでも
// Service Worker と File System Access API が動く。
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(process.argv[3] ?? fileURLToPath(new URL('../dist-web', import.meta.url)))
const port = Number(process.argv[2] ?? 4174)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8'
}

/** 配るディレクトリの外に出ないよう、正規化してから根の下にいることを確かめる。 */
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const target = resolve(join(root, normalize(decoded)))
  return target === root || target.startsWith(root + sep) ? target : null
}

async function fileOr(target, fallback) {
  try {
    const info = await stat(target)
    if (info.isDirectory()) return fileOr(join(target, 'index.html'), fallback)
    return target
  } catch {
    return fallback
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const target = safePath(req.url ?? '/')
    if (!target) {
      res.writeHead(403).end('forbidden')
      return
    }

    // 見つからないパスは入口の HTML に寄せる（単一ページのアプリのため）
    const file = await fileOr(target, join(root, 'index.html'))
    let info
    try {
      info = await stat(file)
    } catch {
      res.writeHead(404).end('not found')
      return
    }

    const ext = extname(file)
    const name = file.slice(root.length + 1)
    // 入口の HTML と Service Worker を握らせると、更新が届かなくなる。
    // ハッシュの付いた資材は中身が変わらないので長く持たせてよい。
    const volatile = name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest'

    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': volatile ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Service-Worker-Allowed': '/'
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
  })()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`mdview（ブラウザ版）: http://localhost:${port}/`)
  console.log(`配布元: ${root}`)
})
