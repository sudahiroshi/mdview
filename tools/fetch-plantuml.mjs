// tako:run: node tools/fetch-plantuml.mjs
// PlantUML の jar を resources/ に取得する（MIT ライセンス版）。
// 図式の描画に必要だが 10MB 超あるため git には含めず、各環境で取得する。
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'resources', 'plantuml.jar')

try {
  const st = await stat(dest)
  console.log(`すでに存在します: ${dest} (${(st.size / 1024 / 1024).toFixed(1)} MB)`)
  process.exit(0)
} catch {
  // 未取得なのでダウンロードへ進む
}

const rel = await (await fetch('https://api.github.com/repos/plantuml/plantuml/releases/latest')).json()
const asset = rel.assets?.find((a) => /^plantuml-mit-[\d.]+\.jar$/.test(a.name))
if (!asset) {
  console.error(`plantuml-mit-*.jar が見つかりません（リリース ${rel.tag_name}）`)
  process.exit(1)
}

console.log(`取得中: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`)
const res = await fetch(asset.browser_download_url)
if (!res.ok) {
  console.error(`ダウンロード失敗: ${res.status}`)
  process.exit(1)
}
await mkdir(join(root, 'resources'), { recursive: true })
await writeFile(dest, Buffer.from(await res.arrayBuffer()))
console.log(`保存しました: ${dest}`)
