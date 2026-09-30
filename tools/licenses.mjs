#!/usr/bin/env node
// 同梱ライブラリのライセンス表示 THIRD-PARTY-NOTICES.md を作る。
//
//   node tools/licenses.mjs          書き出す
//   node tools/licenses.mjs --check  現物と食い違っていたら異常終了する（CI 用）
//
// 対象は「配布物に入るもの」だけ。ビルド道具（vite, electron-builder, vitest …）は
// 成果物に含まれないので数えない。逆に、木揺すりで落ちたものまで数える方向には
// 寄せてある。表示が過剰になることはあっても、漏れることはない。

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** レンダラ・メインのバンドルに入るライブラリ。ここから依存を辿る。 */
const ROOTS = [
  'markdown-it',
  'markdown-it-attrs',
  'markdown-it-texmath',
  'mathjax-full',
  'mermaid',
  '@viz-js/viz',
  '@plantuml/core',
  'katex'
]

/** npm の外から来るもの。実行環境と、WASM に焼き込まれている C 製のライブラリ。 */
const EXTRA = [
  {
    name: 'Electron',
    version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies.electron.replace(/^\^/, ''),
    license: 'MIT',
    url: 'https://github.com/electron/electron',
    note: 'アプリの実行環境。Chromium（BSD-3-Clause ほか）と Node.js（MIT）を含む。' +
      '各構成要素の全文はアプリの「mdview について」ではなく Electron の配布物に従う。'
  },
  {
    name: 'Graphviz',
    version: '16.0.0',
    license: 'EPL-1.0',
    url: 'https://graphviz.org/license/',
    note: '@viz-js/viz が WebAssembly に焼き込んでいる。dot 図と PlantUML の配置に使う。'
  },
  {
    name: 'Expat (libexpat)',
    version: '2.8.4',
    license: 'MIT',
    url: 'https://github.com/libexpat/libexpat',
    note: '同じく @viz-js/viz の WebAssembly に含まれる XML パーサ。'
  }
]

/** package.json に license が無い / 不正確なものの補正。根拠を添えて手で埋める。 */
const OVERRIDE = {
  khroma: { license: 'MIT', reason: 'package.json に license 欄が無い。同梱の license ファイルは MIT。' }
}

function resolvePackageJson(name, from) {
  let dir = from
  for (;;) {
    const p = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(p)) return p
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ')
  return 'UNKNOWN'
}

function licenseText(dir) {
  const hit = readdirSync(dir).filter((f) => /^(licen[cs]e|copying)/i.test(f) && !/\.(js|ts|json)$/i.test(f))
  // LICENSE-MIT のような枝分かれがあれば全部載せる
  const parts = hit.sort().map((f) => {
    const body = readFileSync(join(dir, f), 'utf8').trim()
    return hit.length > 1 ? `----- ${f} -----\n${body}` : body
  })
  return parts.join('\n\n') || null
}

function repoUrl(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  if (!r) return pkg.homepage ?? null
  return r
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^github:/, 'https://github.com/')
}

const collected = new Map()

function visit(name, from) {
  // 型定義だけのパッケージは実行時のコードを持たないので配布物に入らない
  if (name.startsWith('@types/')) return
  const pj = resolvePackageJson(name, from)
  if (!pj) throw new Error(`${name} を解決できない。npm install を済ませてから実行する。`)
  const dir = dirname(pj)
  const pkg = JSON.parse(readFileSync(pj, 'utf8'))
  const key = `${pkg.name}@${pkg.version}`
  if (collected.has(key)) return
  const o = OVERRIDE[pkg.name]
  collected.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: o?.license ?? licenseOf(pkg),
    reason: o?.reason ?? null,
    url: repoUrl(pkg),
    text: licenseText(dir)
  })
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir)
}

for (const r of ROOTS) visit(r, root)

const list = [...collected.values()].sort((a, b) => a.name.localeCompare(b.name))
const byLicense = new Map()
for (const p of list) byLicense.set(p.license, (byLicense.get(p.license) ?? 0) + 1)

const summary = [...byLicense.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([lic, n]) => `| ${lic} | ${n} |`)
  .join('\n')

const table = list
  .map((p) => `| ${p.url ? `[${p.name}](${p.url})` : p.name} | ${p.version} | ${p.license} |`)
  .join('\n')

const extra = EXTRA.map((e) => `| [${e.name}](${e.url}) | ${e.version} | ${e.license} | ${e.note} |`).join('\n')

const texts = list
  .map((p) => {
    const head = `### ${p.name} ${p.version}\n\n${p.license}${p.reason ? `（${p.reason}）` : ''}`
    if (!p.text) return `${head}\n\n全文はパッケージに同梱されていない。${p.url ?? ''}\n`
    return `${head}\n\n\`\`\`text\n${p.text}\n\`\`\`\n`
  })
  .join('\n')

const doc = `# 同梱ライブラリのライセンス

mdview 本体の利用条件は [LICENSE](LICENSE)（MIT）。この文書は、配布する
アプリケーションに**組み込まれている**第三者のソフトウェアとその利用条件を示す。

<!-- このファイルは tools/licenses.mjs が作る。手で編集しない。 -->
<!-- 依存を足したり上げたりしたら \`node tools/licenses.mjs\` で作り直す。 -->

対象はレンダラとメインのバンドルに入るものだけ。ビルド道具（vite, electron-builder,
vitest など）と型定義だけのパッケージ（\`@types/*\`）は実行時のコードを持たず成果物にも
入らないので載せていない。逆に、木揺すりで実際には落ちたものも安全側に倒して数えている。

## 内訳

| ライセンス | 数 |
|---|---|
${summary}

## npm の外から来るもの

| | 版 | ライセンス | 備考 |
|---|---|---|---|
${extra}

## 一覧（${list.length} 件）

| パッケージ | 版 | ライセンス |
|---|---|---|
${table}

---

## 全文

${texts}`

const dest = join(root, 'THIRD-PARTY-NOTICES.md')

if (process.argv.includes('--check')) {
  const current = existsSync(dest) ? readFileSync(dest, 'utf8') : ''
  if (current !== doc) {
    console.error('THIRD-PARTY-NOTICES.md が古い。node tools/licenses.mjs で作り直すこと。')
    process.exit(1)
  }
  console.log(`THIRD-PARTY-NOTICES.md は最新（${list.length} 件）`)
} else {
  writeFileSync(dest, doc)
  console.log(`THIRD-PARTY-NOTICES.md を書き出した（${list.length} 件）`)
}
