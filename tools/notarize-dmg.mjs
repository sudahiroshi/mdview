// tako:run: node tools/notarize-dmg.mjs
// 出来上がった DMG を Apple に公証してもらい、結果を DMG に貼り付ける（staple）。
//
// electron-builder は DMG に入れる前のアプリを公証して staple する。
// それだけでもアプリの起動は通るが、配布するのは DMG なので、
// ダウンロードした DMG を開く時点でも判定が通るよう DMG 自体も公証する。
// staple まで済ませると、受け取り側がネットに繋がっていなくても確認が済む。
//
// 資格情報はキーチェーンに預けたものを名前で参照する。ここでは扱わない。
//   xcrun notarytool store-credentials mdview --apple-id <ID> --team-id <チーム> --password <アプリ用パスワード>
//   APPLE_KEYCHAIN_PROFILE=mdview npm run dist:mac
import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const dist = fileURLToPath(new URL('../dist', import.meta.url))
const profile = process.env.APPLE_KEYCHAIN_PROFILE

if (!profile) {
  console.log('APPLE_KEYCHAIN_PROFILE が無いので DMG の公証は飛ばします（署名なしの確認用ビルド）。')
  process.exit(0)
}

const dmgs = (await readdir(dist)).filter((f) => f.endsWith('.dmg'))
if (dmgs.length === 0) {
  console.error('dist/ に DMG がありません')
  process.exit(1)
}

/** すでに Apple 側に結果があるなら、貼り付けるだけで済む。 */
async function staple(path) {
  try {
    await run('xcrun', ['stapler', 'staple', path])
    return true
  } catch {
    return false
  }
}

for (const name of dmgs) {
  const path = join(dist, name)

  // 途中で止まった後の作り直しに備えて、まず貼り付けを試す。
  // 出し直しは数分かかるので、結果が既にあるなら省く。
  if (await staple(path)) {
    console.log(`すでに受理済みでした。貼り付けました: ${name}`)
    continue
  }

  console.log(`公証に出します: ${name}`)
  try {
    const { stdout } = await run(
      'xcrun',
      ['notarytool', 'submit', path, '--keychain-profile', profile, '--wait', '--timeout', '30m'],
      { maxBuffer: 8 * 1024 * 1024 }
    )
    // notarytool は途中経過も "Current status: In Progress" として出す。
    // 最後に出るものが結果なので、最後の一致を見る。
    const statuses = [...stdout.matchAll(/status:\s*(\w[\w ]*)/gi)].map((m) => m[1].trim())
    const status = statuses[statuses.length - 1]
    if (status !== 'Accepted') {
      console.error(stdout)
      console.error(`公証が通りませんでした（${status ?? '不明'}）。次で詳細を見られます:`)
      console.error(`  xcrun notarytool log <id> --keychain-profile ${profile}`)
      process.exit(1)
    }
    if (!(await staple(path))) throw new Error('貼り付けに失敗しました')
    const { stdout: check } = await run('xcrun', ['stapler', 'validate', path])
    console.log(`  受理・貼り付け済み: ${check.trim().split('\n').pop()}`)
  } catch (e) {
    console.error(`${name} の公証に失敗しました:`, (e.stderr || e.message || '').toString().slice(0, 600))
    process.exit(1)
  }
}

console.log('DMG の公証が終わりました。')
