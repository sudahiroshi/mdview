// tako:run: node tools/make-release.mjs
// 配布物を dist/release/ にまとめる。ここの中身をそのままファイルサーバへ置けばよい。
//
// 置くもの
//   mdview-<版>-arm64.dmg       Apple Silicon 用
//   mdview-<版>-x64.dmg         Intel 用
//   mdview-<版>-universal.dmg   どちらでも動く（そのぶん大きい）
//   SHA256SUMS.txt              壊れていないか確かめるためのハッシュ値
//   お読みください.txt            どれを選ぶかと導入手順
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')
const out = join(dist, 'release')
const guide = join(root, 'build', 'dmg', 'はじめにお読みください.txt')
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

/** 利用者に見せる順。迷わないよう、機種別を先に、universal を最後に置く。 */
const ORDER = ['arm64', 'x64', 'universal']
const rank = (name) => {
  const i = ORDER.findIndex((a) => name.includes(`-${a}.`))
  return i < 0 ? ORDER.length : i
}

const packages = (await readdir(dist))
  .filter((f) => /\.(dmg|zip)$/.test(f))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
if (packages.length === 0) {
  console.error('dist/ に配布物（.dmg / .zip）がありません。先に npm run dist:mac を実行してください。')
  process.exit(1)
}

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const lines = []
const found = new Map()
for (const name of packages) {
  const from = join(dist, name)
  await copyFile(from, join(out, name))
  const [buf, info] = await Promise.all([readFile(from), stat(from)])
  const sum = createHash('sha256').update(buf).digest('hex')
  const size = `${(info.size / 1024 / 1024).toFixed(0)} MB`
  lines.push(`${sum}  ${name}`)
  for (const arch of ORDER) if (name.includes(`-${arch}.`)) found.set(arch, { name, size })
  console.log(`${name}  ${size}`)
  console.log(`  SHA-256: ${sum}`)
}

await writeFile(join(out, 'SHA256SUMS.txt'), lines.join('\n') + '\n')

/** 機種ごとの案内。実際に出来たファイル名と大きさをそのまま書く。 */
const row = (arch, label) => {
  const f = found.get(arch)
  return f ? `      ${label}\n        → ${f.name}  （${f.size}）\n` : ''
}
const chooser = `mdview ${version}

■ どのファイルをダウンロードしますか
${''}
   お使いの Mac の種類は、アップルメニュー →「このMacについて」で分かります。

${row('arm64', '「チップ: Apple M1」などと書かれている場合')}${row('x64', '「プロセッサ: Intel Core ...」と書かれている場合')}${row('universal', '分からない場合 / どちらの Mac でも動くものが欲しい場合')}
   universal はどちらの Mac でも動きますが、両方分が入っているぶん大きくなります。


■ ダウンロードしたファイルが壊れていないか確かめる（任意）

   ターミナルでダウンロード先へ移動し、次を実行します。
   同じ場所に SHA256SUMS.txt を置いてください。

     shasum -a 256 -c SHA256SUMS.txt

   使うファイルの行に OK と出れば問題ありません。


${await readFile(guide, 'utf8')}`

// 置き場には案内を 1 つだけ置く。導入手順は上の chooser に取り込んでいるので、
// DMG の中にある「はじめにお読みください.txt」を並べると紛らわしい。
await writeFile(join(out, 'お読みください.txt'), chooser)

console.log(`\nまとまりました: ${out}`)
console.log('この中身をそのままファイルサーバへ置いてください。')
