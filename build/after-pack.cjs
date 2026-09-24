const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * 出来上がったアプリにアドホック署名を付ける。
 *
 * electron-builder は identity: null のとき署名を一切行わない。
 * その状態のバンドルはダウンロード（隔離属性が付く）と組み合わさると
 * 「壊れているため開けません」になり、利用者側で回避する手立てがない。
 * 証明書は持っていないので Developer ID 署名はできないが、
 * アドホック署名を付けておけば「開発元を検証できない」という通常の警告に留まり、
 * システム設定から許可して起動できるようになる。
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  // universal ビルドでは各アーキの一時ディレクトリでも呼ばれる。
  // 統合前に署名しても捨てられるので、最終成果物だけを対象にする。
  if (context.appOutDir.endsWith('-temp')) return

  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' })
  console.log(`  • アドホック署名を付けました  ${app}`)
}
