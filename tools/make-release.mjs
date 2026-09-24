// tako:run: node tools/make-release.mjs
// 配布物を dist/release/ にまとめる。ここの中身をそのままファイルサーバへ置けばよい。
//
// 置くもの
//   mdview-<版>-universal.dmg   本体
//   SHA256SUMS.txt              壊れていないか確かめるためのハッシュ値
//   はじめにお読みください.txt    導入手順（DMG の中にも同じものが入っている）
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const out = join(dist, 'release')
const guide = join(root, 'build', 'dmg', 'はじめにお読みください.txt')

const packages = (await readdir(dist)).filter((f) => /\.(dmg|zip)$/.test(f))
if (packages.length === 0) {
  console.error('dist/ に配布物（.dmg / .zip）がありません。先に npm run dist:mac を実行してください。')
  process.exit(1)
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const lines = []
for (const name of packages) {
  const from = join(dist, name)
  await copyFile(from, join(out, name))
  const [buf, info] = await Promise.all([readFile(from), stat(from)])
  const sum = createHash('sha256').update(buf).digest('hex')
  lines.push(`${sum}  ${name}`)
  console.log(`${name}  ${(info.size / 1024 / 1024).toFixed(1)} MB`)
  console.log(`  SHA-256: ${sum}`)
}

await writeFile(join(out, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
await copyFile(guide, join(out, basename(guide)))

console.log(`\nまとまりました: ${out}`)
console.log('この中身をそのままファイルサーバへ置いてください。')
console.log('受け取り側は次で壊れていないか確かめられます:')
console.log('  shasum -a 256 -c SHA256SUMS.txt')
