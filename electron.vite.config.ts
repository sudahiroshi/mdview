import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/*
 * mathjax-full の components/version.js は PACKAGE_VERSION が未定義だと
 * eval('require') で package.json を読みに行く。レンダラの CSP は eval を
 * 許していないためそこで落ちる。値を埋めておけば分岐そのものが通らなくなる。
 * 依存の最適化（esbuild）と本ビルドの両方に渡す必要がある。
 */
const mathjaxVersion = JSON.parse(
  readFileSync(resolve(__dirname, 'node_modules/mathjax-full/package.json'), 'utf8')
).version as string
const mathjaxDefine = { PACKAGE_VERSION: JSON.stringify(mathjaxVersion) }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // sandbox:true のプリロードは ESM を読めないため CommonJS で出力する
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: mathjaxDefine,
    optimizeDeps: { esbuildOptions: { define: mathjaxDefine } },
    resolve: { alias: { '@core': resolve(__dirname, 'src/core') } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
