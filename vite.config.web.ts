import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

/*
 * mathjax-full の components/version.js は PACKAGE_VERSION が未定義だと
 * eval('require') に落ちる。ブラウザでは eval が通らない場合があるうえ、
 * 無駄な処理なので値を埋めておく（Electron 版の設定と同じ理由）。
 */
const mathjaxVersion = JSON.parse(readFileSync(here('node_modules/mathjax-full/package.json'), 'utf8')).version
const mathjaxDefine = { PACKAGE_VERSION: JSON.stringify(mathjaxVersion) }

/** ブラウザ版（PWA）のビルド。画面のコードは Electron 版とそのまま共有する。 */
export default defineConfig({
  root: here('src/renderer'),
  // 置き場所を選ばないよう相対パスで参照する（配下のディレクトリに置いても動く）
  base: './',
  publicDir: here('web/public'),
  resolve: { alias: { '@core': here('src/core') } },
  define: mathjaxDefine,
  optimizeDeps: { esbuildOptions: { define: mathjaxDefine } },
  server: { port: 5174 },
  preview: { port: 4174 },
  build: {
    outDir: here('dist-web'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000
  }
})
