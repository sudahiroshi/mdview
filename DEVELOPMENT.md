# mdview 開発メモ

使い方は [README.md](README.md) を参照。ここは作る側の話。

---

## 必要なもの

**Node.js 22 以降だけ。** 実行時の外部依存はありません（Java も Graphviz も不要）。

```sh
npm install
```

## コマンド

| | |
|---|---|
| `npm run dev` | デスクトップ版を開発起動 |
| `npm run build` | `out/` にビルド |
| `npm run dist` | `dist/mac-arm64/mdview.app` を作る（未署名） |
| `npm run web:dev` | ブラウザ版を開発起動（<http://localhost:5174>） |
| `npm run web:build` | `dist-web/` に書き出す |
| `npm run web:serve` | `dist-web/` を配る（<http://localhost:4174>） |
| `npm test` | 単体テスト（83 件） |
| `npm run typecheck` | 型検査（node 側と web 側の 2 プロジェクト） |

---

## 構成

```
src/core/       1258 行  パーサ、番号付け、相互参照、LaTeX 変換、数式、PDF 設定
src/platform/    490 行  環境差を吸収する層。Electron 版とブラウザ版の 2 実装
src/renderer/   1111 行  描画、図式レンダリング、書き出し UI（両環境で共有）
src/main/        540 行  ウインドウ、ファイル IO と監視、PDF 生成（デスクトップ版のみ）
src/preload/      66 行  contextBridge で公開する API（デスクトップ版のみ）
web/public/              PWA の manifest・Service Worker・アイコン
tools/                   検証とアイコン生成のスクリプト
```

### 層の約束

- **`src/core/` は DOM にも Node にも Electron にも依存しない。** 純粋ロジックだけを置く。
  ここが独立しているおかげで、単体テストが速く、ブラウザ版へそのまま移せた。
  `markdown-it` / `mathjax-full` のような描画ライブラリは可。
- **`src/renderer/` は `window.api` を直接触らない。** 必ず `src/platform` 越しに呼ぶ。
  環境ごとの「できること」は `Platform.capabilities` で分岐する。
- **実装の選択は実行時。** `'api' in window` で Electron 版かブラウザ版かを決める
  （`src/platform/index.ts`）。ビルドを分ける必要がない。

### 追加・変更するときの勘所

| やりたいこと | 触る場所 |
|---|---|
| Markdown の解釈・採番・LaTeX 変換 | `src/core/` + `test/` にテスト |
| 画面の見た目・書き出し UI | `src/renderer/src/` |
| 環境依存の機能（ファイル、保存、印刷） | `src/platform/types.ts` に口を足して 2 実装 |
| デスクトップ版だけの機能 | `src/main/` + `src/preload/` + `src/platform/electron.ts` |

---

## 踏んだ落とし穴

同じ穴を掘り直さないための記録。いずれも実機で確認した挙動。

### 図式

- **mermaid は `look: 'classic'` にする。** 既定の `neo` はノードに
  `filter: drop-shadow` を掛ける。CSS フィルタが掛かった要素は Chromium の印刷経路で
  ラスタライズされ、PDF がベクターでなくなる。
- **mermaid は `htmlLabels: false` にする。** 既定ではラベルが `foreignObject` になるが、
  これは `<img>` 経由のラスタライズで無視されるため、PNG 書き出しで文字が消える。
- **PlantUML のエンジンは同時実行できない。** 複数の図を並行して渡すと応答が返らなくなる。
  `src/renderer/src/diagrams.ts` で 1 本の列にして順番に流し、30 秒の時間切れも設けている。
- **PlantUML は Graphviz を `globalThis.Viz` から探す。** 同梱の `viz-global.js`（1.4MB）を
  読ませる想定だが、dot の描画で使っている `@viz-js/viz` を渡して二重持ちを避けている。
  渡さないと Smetana に退避して図の体裁が変わる。
- **PlantUML の `themes.js` は import して登録する。** 既定は「ページと同じ場所から取りに行く」
  挙動で、`file://` では成立しない。
- **Graphviz は図の先頭に全面を覆う白いポリゴンを置く。** 透過で書き出すときはこれを外さないと
  白いまま。図形は入れ子の `transform` の中にいるので、属性の座標ではなく
  `getBoundingClientRect()` の実寸で判定する。

### 数式

- **MathJax の `fontCache` は `'local'` にする。** 既定の `'global'` はグリフの実体を
  文書内の共有 `<defs>` へ逃がすので、数式 1 つを取り出して保存すると**文字が消える**。
- **`PACKAGE_VERSION` をビルド時に埋める。** `mathjax-full/js/components/version.js` は
  未定義だと `eval('require')` で package.json を読みに行き、レンダラの CSP に触れて
  アプリが起動しなくなる。`electron.vite.config.ts` と `vite.config.web.ts` の両方で、
  本ビルドと依存の最適化（esbuild）の双方に渡す必要がある。
- **`liteAdaptor` を使うと MathJax が CSS を差し込まない。** `styleSheet()` から取って
  起動時に一度入れる。入れ忘れるとインライン数式の縦位置がずれる。
- **`katex` は直接使っていないが依存から外せない。** `markdown-it-texmath` が
  `require('katex')` を静的に含むため、外すと dev のバンドルが解決に失敗する
  （`mermaid` も内部で使っている）。

### PDF

- **`printToPDF` の `pageSize` はインチ指定。** CSS ピクセルは 96dpi で換算する。
- **`printToPDF` は透過にできない。** ページ全面を必ず白で塗る。`printBackground: false`、
  ウインドウの `transparent: true`、背景を持たない SVG、いずれでも白い塗りが入る。
- **用紙に収まらない図は縮める。** はみ出した分がそのまま空白ページになる。
  本文領域は `contentBoxPx()` で求める。
- **表は「行の境界でなら切れる」にする。** 表ごと分割禁止にすると、1 ページに
  収まらない表が直前の見出しごと次ページへ押し出され、手前に空白ページができる。
  `thead` は `display: table-header-group` で繰り返す。
- **`@page` のマージンボックスは、書いた辺のブラウザ既定ヘッダーを抑止する。**
  抑止は辺ごとなので、何も置かない辺には空の枠を入れる。これをしないと、
  印刷ダイアログの「ヘッダーとフッター」が有効なときに日付や URL が混ざる。
- **画面のウインドウをそのまま印刷しない。** ツールバーごと印刷され、本文を
  スクロールさせている入れ物のせいでページ送りも壊れる。デスクトップ版は
  同じレンダラを隠しでもう一枚開き、ブラウザ版は印刷中だけ本文を差し替える。

### 画像

- **配信の範囲は文書のあるディレクトリの中だけ。** `mdv-asset` プロトコル
  （`src/main/assets.ts`）が範囲外を 403 で断る。`../` を含むパスは読めない。
  ブラウザ版も、許可をもらったディレクトリの外へは出ない。
- **外部 URL の画像は CSP で止まる。** `img-src` に `https:` を入れていない。
- **URL を決めただけでは読めたことにならない。** 配信側に断られても `<img>` に src が
  入っていれば、ブラウザは壊れアイコンを描く。`load` / `error` を待って初めて
  成否が分かるので、そこまで見てから代替表示に差し替える
  （これを怠ると、画面でも書き出した PDF でも壊れアイコンが残る）。

### 書き出し全般

- **SVG の高さは viewBox の比から出す。** 実寸を整数に丸めたままだと比がずれ、
  書き出しの縁に透明な帯が残る。
- **PNG は画布そのものを先に塗る。** SVG 内の背景矩形は viewBox の範囲しか塗れない。
- **図の自動 id は章で戻さない。** 図表番号は章ごとにリセットするが、それを id に使うと
  章をまたいで `fig-1` が重複し、アンカーが壊れる。

### 環境

- **`sandbox: true` のプリロードは ESM を読めない。** CommonJS（`index.cjs`）で出力する。
- **ファイル監視は親ディレクトリを見る。** 多くのエディタは一時ファイルへ書いてから
  rename するので、ファイル自身に張った監視は保存一回で外れる。
- **ブラウザ版にファイル監視の API は無い。** `FileSystemFileHandle` の更新時刻を
  0.8 秒ごとに見る。
- **File System Access API は Chromium 系のみ。** Safari / Firefox ではピッカーが無いので、
  `<input type=file>` とダウンロードに落とし、制約を画面に出す。

---

## 検証のしかた

### 単体テスト

`src/core/` の純粋ロジックを対象にしている（採番・相互参照・LaTeX 変換・PDF 設定・数式）。

```sh
npm test
```

### 起動中のアプリを調べる

```sh
MDVIEW_DEBUG_PORT=9333 npm run dev
MDVIEW_DEBUG_PORT=9333 node tools/probe.mjs "<JS 式>"
```

`MDVIEW_DEBUG_PORT` を付けたときだけ、レンダラに `window.__mdview`（開発ビルドのみ）と
`window.debugApi` が生える。後者は保存ダイアログを挟まずに PDF のバイト列を取り出せる。

```js
// 例
window.__mdview.open('/path/to/doc.md')
window.__mdview.snapshotSvg(fig, { background: '#ffffff' })
window.debugApi.docPdfBytes(html, options)
```

### ブラウザ版を調べる

```sh
npm run web:dev
npx electron --remote-debugging-port=9335 tools/open-web.mjs http://localhost:5174/
MDVIEW_DEBUG_PORT=9335 node tools/probe.mjs "<JS 式>"
```

`tools/open-web.mjs` は preload を差さない素の Chromium ウインドウなので、
`window.api` が無く、アプリはブラウザ版として動く。

### 書き出した PDF を検査する

```sh
pdfinfo x.pdf                    # ページ数・用紙
pdftotext -f 1 -l 1 x.pdf -      # ヘッダー・フッター・本文
pdfimages -list x.pdf            # ★ ここが 0 行ならベクター
pdffonts x.pdf                   # 埋め込みフォント
pdftoppm -png -r 70 -f 1 -l 1 x.pdf out   # 目視用
```

**`pdfimages -list` が空であることが、ベクターで出ている証拠。** 図がラスタ化する
不具合（mermaid の drop-shadow など）はこれで検出できる。

### テスト用の文書

```
test/fixtures/sample.md     4 種の図・数式・表・相互参照を一通り
test/fixtures/plantuml.md   PlantUML を 5 種（内部レイアウトと Graphviz の両方）
test/fixtures/math.md       分数・積分・行列・連立・日本語・長い式・壊れた式
test/fixtures/no-h1.md      H1 が無い文書（通し番号のフォールバック）
```

---

## アイコン

`build/icon.svg` が原本。変更したら作り直す。

```sh
npx electron tools/make-icon.mjs
```

`.icns` に必要な 10 サイズと、PWA 用の 192 / 512px を書き出す。外部の SVG 変換器
（rsvg-convert など）には依存せず、Electron の canvas で描いて `iconutil` でまとめる。

---

## 配布

### デスクトップ版

```sh
npm run dist       # 開発中の確認用。arm64 のアプリだけを作る（速い）
npm run dist:mac   # 配布用。universal の DMG を作り、dist/release/ にまとめる
```

`dist:mac` の成果物:

```
dist/release/
  mdview-<版>-arm64.dmg        Apple Silicon 用（約 126 MB）
  mdview-<版>-x64.dmg          Intel 用（約 132 MB）
  mdview-<版>-universal.dmg    どちらでも動く（約 223 MB）
  SHA256SUMS.txt               受け取り側の検証用
  お読みください.txt             どれを選ぶかと導入手順
```

**この中身をそのままファイルサーバへ置く。** 版はファイル名に入るので、
`package.json` の `version` を上げてから作る。

機種別を出しているのは、universal が両アーキを抱えて倍近くなるため。
`お読みください.txt` は `tools/make-release.mjs` が出来上がったファイル名と
実際の大きさを見て組み立てる（手で書くと版を上げるたびにずれる）。
導入手順は `build/dmg/はじめにお読みください.txt` が一次情報で、
DMG の中にはそれが入り、置き場の案内にはその内容が取り込まれる。

#### アドホック署名を必ず付ける

`build/after-pack.cjs` が、出来上がったアプリに `codesign --sign -` を掛けている。
**これを外すと配布が成立しない。**

electron-builder は `identity: null` のとき署名を一切行わない。署名の無いバンドルは、
ダウンロードで付く隔離属性と組み合わさると **「壊れているため開けません」** になり、
利用者側に回避する手立てがない。アドホック署名を付けておけば
「開発元を検証できない」という通常の警告に留まり、システム設定から許可して起動できる。

実際に確かめた違い:

| | 署名なし | アドホック署名 |
|---|---|---|
| `codesign --verify --deep --strict` | `code object is not signed at all` | 成功 |
| バンドルの Identifier | `Electron` | `jp.ac.chibatech.suda.mdview` |
| 隔離属性を付けたとき | 「壊れている」扱い | 「開発元を検証できない」（許可すれば起動） |

`--deep` は非推奨だが、入れ子の Electron Framework と Helper まで一度に署名するには
この方法が確実。署名後に `codesign --verify --deep --strict` が通ることを確認している。

universal ビルドでは各アーキの一時ディレクトリでも `afterPack` が呼ばれる。
統合前に署名しても捨てられるので、`-temp` で終わる出力先は飛ばしている。

#### 証明書が手に入ったら

Apple Developer Program に登録して Developer ID 証明書を入れれば、
`mac.identity` に証明書名を指定し、`mac.notarize` を有効にする。
そうすれば受け取り側は普通にダブルクリックで開けるようになり、
上の許可操作も `build/dmg/はじめにお読みください.txt` の説明も不要になる。

### ブラウザ版

`dist-web/` を静的ファイルとして置くだけ。`base: './'` なのでサブディレクトリでも動く。

**HTTPS か localhost が必要。** Service Worker と File System Access API が
安全なオリジンでしか動かないため。

`npm run web:serve`（`tools/serve-web.mjs`、依存なし）は手元での確認用。
入口の HTML と Service Worker は `no-cache`、ハッシュ付きの資材は 1 年の `immutable` を返し、
配布ディレクトリの外は返さない。

#### GitHub Pages への配置

`.github/workflows/deploy-web.yml` が `main` への push で動く
（ブラウザ版に関わるファイルが変わったときだけ。手動実行も可）。
型検査と単体テストを通してから組み立て、成果物を Pages へ渡す。

**成果物はリポジトリに入れない。** `gh-pages` ブランチも作らず、
Actions の成果物として直接配る方式にしている。`dist-web/` はハッシュ付きの
ファイル名で毎回変わるので、コミットすると更新のたびに数 MB の差分が積み上がる。

はじめに一度だけ、リポジトリの **Settings > Pages > Source を「GitHub Actions」** に
する必要がある。これをしないと配置の段階で失敗する。

Electron の実行ファイルはブラウザ版のビルドに要らないが、electron 44 には
install を省く環境変数が無いため止められない。`~/.cache/electron` を
使い回して 2 回目以降の取得を省いている。
