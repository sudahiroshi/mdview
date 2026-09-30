// tako:run: node tools/verify-release.mjs
// 配布物が「受け取り側で特別な操作なしに開ける」状態かを確かめる。
//
// 見るところ
//   アプリ: 署名の正当性 / hardened runtime / Gatekeeper の判定 / アーキ / 版
//   DMG  : 署名の正当性 / Gatekeeper の判定 / 公証結果が貼り付けてあるか
//
// Gatekeeper が accepted、かつ stapler validate が通れば、
// ダウンロードした利用者はダブルクリックだけで起動できる。
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')

/** 失敗しても続けたいので、成否と出力をそのまま返す。 */
async function tryRun(cmd, args) {
  try {
    const { stdout, stderr } = await run(cmd, args, { maxBuffer: 4 * 1024 * 1024 })
    return { ok: true, out: `${stdout}${stderr}` }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? e.message ?? ''}` }
  }
}

const expected = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
let bad = 0
const say = (ok, label, detail) => {
  if (!ok) bad++
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? `  ${detail}` : ''}`)
}

const entries = await readdir(dist, { withFileTypes: true })

console.log(`\n=== アプリ（版 ${expected} を期待）===`)
for (const d of entries.filter((e) => e.isDirectory() && e.name.startsWith('mac') && !e.name.endsWith('-temp'))) {
  const app = join(dist, d.name, 'mdview.app')
  console.log(`\n[${d.name}]`)

  const info = await tryRun('defaults', ['read', join(app, 'Contents', 'Info.plist'), 'CFBundleShortVersionString'])
  say(info.out.trim() === expected, `版 ${info.out.trim()}`)

  const arch = await tryRun('lipo', ['-info', join(app, 'Contents', 'MacOS', 'mdview')])
  say(arch.ok, `アーキ ${arch.out.replace(/.*(?:are|is architecture):\s*/s, '').trim()}`)

  const sign = await tryRun('codesign', ['--verify', '--deep', '--strict', app])
  say(sign.ok, '署名の検証')

  const detail = await tryRun('codesign', ['-dv', '--verbose=2', app])
  const hardened = /flags=\S*runtime/.test(detail.out)
  const devId = /Authority=Developer ID Application/.test(detail.out)
  say(hardened, 'hardened runtime')
  say(devId, 'Developer ID で署名', (/Authority=(Developer ID Application[^\n]*)/.exec(detail.out) ?? [])[1] ?? '')

  const gate = await tryRun('spctl', ['-a', '-vv', '-t', 'exec', app])
  const accepted = /accepted/.test(gate.out)
  say(accepted, 'Gatekeeper', gate.out.replace(/\s+/g, ' ').trim().slice(0, 90))

  const staple = await tryRun('xcrun', ['stapler', 'validate', app])
  say(staple.ok, '公証結果の貼り付け（アプリ）')
}

console.log('\n=== DMG ===')
for (const name of entries.filter((e) => e.isFile() && e.name.endsWith('.dmg')).map((e) => e.name)) {
  console.log(`\n[${name}]`)
  const path = join(dist, name)

  say(name.includes(expected), `ファイル名に版 ${expected}`)

  const sign = await tryRun('codesign', ['--verify', '--strict', path])
  say(sign.ok, 'DMG の署名')

  const staple = await tryRun('xcrun', ['stapler', 'validate', path])
  say(staple.ok, '公証結果の貼り付け（DMG）', staple.out.replace(/\s+/g, ' ').trim().slice(0, 60))

  const gate = await tryRun('spctl', ['-a', '-vv', '-t', 'open', '--context', 'context:primary-signature', path])
  say(/accepted/.test(gate.out), 'Gatekeeper', gate.out.replace(/\s+/g, ' ').trim().slice(0, 90))
}

console.log(bad === 0 ? '\nすべて問題ありません。\n' : `\n${bad} 件が期待どおりではありません。\n`)
process.exit(bad === 0 ? 0 : 1)
