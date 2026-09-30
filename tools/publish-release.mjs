#!/usr/bin/env node
// tako:run: node tools/publish-release.mjs --dry-run
// dist/release/ の中身を GitHub Releases へ上げる。
//
//   node tools/publish-release.mjs            v<版> のリリースを作って添付する
//   node tools/publish-release.mjs --draft    下書きとして作る（内容を見てから公開する）
//   node tools/publish-release.mjs --dry-run  確認だけして何も送らない
//   node tools/publish-release.mjs --notes x.md  リリースノートを自分で書いたものに差し替える
//
// 署名と公証は手元でしかできない（証明書をこの端末から出さない方針）。
// そのため配布物を作るのは手元、上げるのだけをこの道具がやる。
//
//   APPLE_KEYCHAIN_PROFILE=mdview npm run dist:mac   # 作って公証する
//   npm run release                                   # 上げる
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const release = join(root, 'dist', 'release')

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const valueOf = (f) => {
  const i = args.indexOf(f)
  return i < 0 ? null : args[i + 1]
}
const dryRun = has('--dry-run')

const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const tag = `v${version}`

const problems = []
const ng = (msg) => problems.push(msg)
const ok = (msg) => console.log(`  ✅ ${msg}`)

/** 進捗を見せたいもの（数百 MB の転送）は、出力をそのまま流す。 */
function runLive(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit' })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} が ${code} で終了しました`))))
  })
}

async function tryRun(cmd, cmdArgs, opts) {
  try {
    const { stdout, stderr } = await run(cmd, cmdArgs, { maxBuffer: 8 * 1024 * 1024, ...opts })
    return { ok: true, out: `${stdout}${stderr}` }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? e.message ?? ''}` }
  }
}

// ---- 前提を確かめる -------------------------------------------------------
// 公開したあとで「署名されていない物を配ってしまった」に気づくのは手遅れなので、
// 送る前に全部見る。

console.log(`\n=== ${tag} を公開する準備を確かめる ===\n`)

if (!(await tryRun('gh', ['--version'])).ok) {
  console.error('gh コマンドがありません。brew install gh で入れてください。')
  process.exit(1)
}
const auth = await tryRun('gh', ['auth', 'status'])
if (!auth.ok) {
  console.error('GitHub にログインしていません。gh auth login を実行してください。')
  process.exit(1)
}
ok('gh にログイン済み')

if (!existsSync(release)) {
  console.error(`${release} がありません。先に npm run dist:mac を実行してください。`)
  process.exit(1)
}

const files = (await readdir(release)).filter((f) => !f.startsWith('.'))
const dmgs = files.filter((f) => f.endsWith('.dmg')).sort()
if (dmgs.length === 0) ng('dist/release/ に DMG がありません')
for (const f of ['SHA256SUMS.txt', 'お読みください.txt']) {
  if (!files.includes(f)) ng(`dist/release/${f} がありません`)
}

// 版のずれ。package.json を上げずに作り直した配布物を上げる事故を止める。
for (const d of dmgs) {
  if (!d.includes(`-${version}-`)) ng(`${d} は版 ${version} の配布物ではありません`)
}
if (problems.length === 0) ok(`配布物 ${dmgs.length} 件（${dmgs.map((d) => d.replace(/^mdview-[^-]+-|\.dmg$/g, '')).join(', ')}）`)

// ハッシュ。コピー中に壊れていたら気づく。
const sums = new Map(
  (await readFile(join(release, 'SHA256SUMS.txt'), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sum, name] = l.trim().split(/\s+/)
      return [name, sum]
    })
)
for (const d of dmgs) {
  const actual = createHash('sha256').update(await readFile(join(release, d))).digest('hex')
  if (sums.get(d) !== actual) ng(`${d} のハッシュが SHA256SUMS.txt と一致しません`)
}
ok('SHA256SUMS.txt と一致')

// 署名と公証。ここが通らないものを配ると受け取り側で「壊れています」になる。
for (const d of dmgs) {
  const path = join(release, d)
  if (!(await tryRun('codesign', ['--verify', '--strict', path])).ok) ng(`${d} が署名されていません`)
  if (!(await tryRun('xcrun', ['stapler', 'validate', path])).ok) ng(`${d} に公証結果が貼られていません`)
  const gate = await tryRun('spctl', ['-a', '-vv', '-t', 'open', '--context', 'context:primary-signature', path])
  if (!/accepted/.test(gate.out)) ng(`${d} が Gatekeeper に通りません`)
}
if (dmgs.length) ok('署名・公証・Gatekeeper')

// タグ。リリースはタグに紐づくので、中身と食い違っていると後から追えなくなる。
const head = (await tryRun('git', ['rev-parse', 'HEAD'], { cwd: root })).out.trim()
const tagged = await tryRun('git', ['rev-list', '-n', '1', tag], { cwd: root })
if (!tagged.ok) {
  ng(`タグ ${tag} がありません。git tag -a ${tag} -m "..." && git push origin ${tag}`)
} else {
  if (tagged.out.trim() !== head) ng(`タグ ${tag} が HEAD を指していません（${tagged.out.trim().slice(0, 8)} ≠ ${head.slice(0, 8)}）`)
  const remote = await tryRun('git', ['ls-remote', '--tags', 'origin', tag], { cwd: root })
  if (!remote.out.includes(tag)) ng(`タグ ${tag} が origin にありません。git push origin ${tag}`)
  else ok(`タグ ${tag} が origin にある`)
}

const dirty = (await tryRun('git', ['status', '--porcelain'], { cwd: root })).out.trim()
if (dirty) ng(`未コミットの変更があります:\n${dirty.split('\n').map((l) => `      ${l}`).join('\n')}`)
else ok('作業ツリーがきれい')

if (problems.length > 0) {
  console.error('\n次の点を直してから実行してください。\n')
  for (const p of problems) console.error(`  ❌ ${p}`)
  console.error('')
  process.exit(1)
}

// ---- リリースノート -------------------------------------------------------

const notesPath = valueOf('--notes')
let notes
if (notesPath) {
  notes = await readFile(notesPath, 'utf8')
} else {
  // 直前のタグからの変更をそのまま並べる。手で書き直したいときは --notes を使う。
  const prev = await tryRun('git', ['describe', '--tags', '--abbrev=0', `${tag}^`], { cwd: root })
  const range = prev.ok ? `${prev.out.trim()}..${tag}` : tag
  const log = await tryRun('git', ['log', '--no-merges', '--pretty=- %s', range], { cwd: root })
  const sizeOf = async (name) => `${((await readFile(join(release, name))).length / 1024 / 1024).toFixed(0)} MB`
  const rows = []
  for (const [arch, label] of [
    ['arm64', 'チップ: Apple M1 など'],
    ['x64', 'プロセッサ: Intel Core…'],
    ['universal', '分からない / 両対応が欲しい']
  ]) {
    const f = dmgs.find((d) => d.endsWith(`-${arch}.dmg`))
    if (f) rows.push(`| ${label} | \`${f}\` | 約 ${await sizeOf(f)} |`)
  }

  notes = `## 入れかた

お使いの Mac に合う DMG を 1 つだけダウンロードしてください
（アップルメニュー →「このMacについて」で分かります）。

| Mac | ファイル | 大きさ |
|---|---|---|
${rows.join('\n')}

DMG を開き、mdview を「アプリケーション」へドラッグします（macOS 11 以降）。
あとはダブルクリックで起動します。**特別な許可操作は要りません**
（Apple の署名と公証を受けています）。

ダウンロードしたものが壊れていないかは、\`SHA256SUMS.txt\` を同じ場所に置いて
\`shasum -a 256 -c SHA256SUMS.txt\` で確かめられます。

## 変更

${prev.ok ? `${prev.out.trim()} からの変更。\n\n` : ''}${log.out.trim() || '- （記録なし）'}

## 不具合の報告・要望

[Issues](https://github.com/sudahiroshi/mdview/issues) へお願いします。

## ライセンス

mdview 本体は MIT（[LICENSE](https://github.com/sudahiroshi/mdview/blob/${tag}/LICENSE)）。
同梱ライブラリの条件は
[THIRD-PARTY-NOTICES.md](https://github.com/sudahiroshi/mdview/blob/${tag}/THIRD-PARTY-NOTICES.md) を参照してください。
`
}

const notesFile = join(tmpdir(), `mdview-${tag}-notes.md`)
await writeFile(notesFile, notes)

// ---- 上げる ---------------------------------------------------------------

const assets = files.map((f) => join(release, f))

console.log(`\n=== ${tag} ===\n`)
console.log(notes.replace(/^/gm, '  '))
console.log('添付するもの:')
for (const f of files) console.log(`  ${f}`)

if (dryRun) {
  console.log('\n--dry-run なので何も送っていません。')
  process.exit(0)
}

const exists = (await tryRun('gh', ['release', 'view', tag], { cwd: root })).ok

if (exists) {
  console.log(`\nリリース ${tag} は既にあります。添付を差し替えます。`)
  await runLive('gh', ['release', 'upload', tag, ...assets, '--clobber'])
  await runLive('gh', ['release', 'edit', tag, '--notes-file', notesFile])
} else {
  const create = ['release', 'create', tag, ...assets, '--title', `mdview ${version}`, '--notes-file', notesFile]
  if (has('--draft')) create.push('--draft')
  await runLive('gh', create)
}

const url = (await tryRun('gh', ['release', 'view', tag, '--json', 'url', '--jq', '.url'], { cwd: root })).out.trim()
console.log(`\n公開しました: ${url}`)
if (has('--draft')) console.log('下書きです。内容を見てから公開してください。')
