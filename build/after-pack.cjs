const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * 出来上がったアプリにアドホック署名を付ける。
 *
 * Developer ID の証明書が無い環境（他の人がこのリポジトリをビルドした場合など）では、
 * electron-builder は署名を行わない。署名の無いバンドルはダウンロードで付く
 * 隔離属性と組み合わさると「壊れているため開けません」になり、利用者側に
 * 回避する手立てがない。アドホック署名を付けておけば「開発元を検証できない」
 * という通常の警告に留まり、システム設定から許可して起動できる。
 */
/** Developer ID の証明書が入っているか。あれば electron-builder が正式に署名する。 */
function hasDeveloperId() {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' })
    return out.includes('Developer ID Application')
  } catch {
    return false
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  // 正式な署名ができるなら、この後 electron-builder が署名する。
  // ここでアドホック署名を付けても上書きされるだけなので何もしない。
  if (hasDeveloperId()) return

  // universal ビルドでは各アーキの一時ディレクトリでも呼ばれる。
  // 統合前に署名しても捨てられるので、最終成果物だけを対象にする。
  if (context.appOutDir.endsWith('-temp')) return

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' })
  console.log(`  • アドホック署名を付けました  ${app}`)
}
