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
| `npm run licenses` | `THIRD-PARTY-NOTICES.md` を作り直す |
| `npm run release` | `dist/release/` を GitHub Releases へ上げる |

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

### 複数ウインドウ（デスクトップ版）

- **状態はウインドウごとに持つ。** `src/main/index.ts` の `windows: Map<number, DocWindow>`
  が、表示中の文書とファイル監視を webContents の id で引く。
- **画像の配信範囲もウインドウごと。** 配信要求からは要求元のウインドウが分からないので、
  URL に id を含めてもらう（`mdv-asset://local/<id>/<パス>`）。全ウインドウの範囲を
  ひとまとめにすると、別のウインドウで開いている文書の隣のファイルまで読めてしまう。
- **ウインドウの題はレンダラが設定する。** `win.setTitle()` は `document.title` に
  上書きされるので、メイン側で決めた文字列を `ui:title` で送り、レンダラに付けさせる。
  同名ファイルを複数開いたときは親フォルダ名を添える。
- **設定の変更は他のウインドウにも配る。** 設定はアプリ全体で 1 つなので、
  配らないと片方で番号モードを変えても他方が古い表示のまま残る。
- **`open-file` はウインドウが 0 枚でも処理する。** macOS は全部閉じてもアプリが残る。
  「ready 済みかつウインドウがある」を条件にすると、その状態で開いたファイルが
  どこにも行かずに消える。

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

複数ウインドウがあるときは、第 2 引数で対象を選ぶ（番号か、題に含まれる文字列）。

```sh
MDVIEW_DEBUG_PORT=9333 node tools/probe.mjs "document.title" 1
MDVIEW_DEBUG_PORT=9333 node tools/probe.mjs "document.title" sample
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
npm run dist:mac   # 配布用。3 種の DMG を作って公証し、dist/release/ にまとめる
```

`dist:mac` の成果物:

```
dist/release/
  mdview-<版>-arm64.dmg        Apple Silicon 用（約 126 MB）
  mdview-<版>-x64.dmg          Intel 用（約 132 MB）
  mdview-<版>-universal.dmg    どちらでも動く（約 223 MB）
  SHA256SUMS.txt               受け取り側の検証用
  お読みください.txt             どれを選ぶかと導入手順
  LICENSE                      本体の利用条件
  THIRD-PARTY-NOTICES.md       同梱ライブラリの利用条件
```

**この中身をそのまま配る。** GitHub Releases でも学内ファイルサーバでも、
置くものは同じ。版はファイル名に入るので、`package.json` の `version` を
上げてから作る。

版を上げたら、**README.md と `.github/ISSUE_TEMPLATE/bug_report.yml` の版も直す。**
README はダウンロードするファイル名をそのまま載せているので、放っておくと
利用者が存在しないファイルを探すことになる。`publish-release.mjs` が
`package.json` と食い違っていたら公開を止めるので、忘れても配ってしまうことはない。

機種別を出しているのは、universal が両アーキを抱えて倍近くなるため。
`お読みください.txt` は `tools/make-release.mjs` が出来上がったファイル名と
実際の大きさを見て組み立てる（手で書くと版を上げるたびにずれる）。
導入手順は `build/dmg/はじめにお読みください.txt` が一次情報で、
DMG の中にはそれが入り、置き場の案内にはその内容が取り込まれる。

#### 署名と公証

Developer ID の証明書がキーチェーンに入っていれば、electron-builder が自動で拾って
署名する（`mac.identity` はあえて指定していない）。あわせて次を設定してある。

| 設定 | 理由 |
|---|---|
| `mac.hardenedRuntime: true` | 公証の必須条件 |
| `mac.notarize: true` | アプリを公証して staple する |
| `dmg.sign: true` | DMG 自体にも署名する |

entitlements は electron-builder の既定（`allow-jit` / `allow-unsigned-executable-memory` /
`disable-library-validation`）をそのまま使う。Electron に必要なものが揃っている。

**公証は 2 段階ある。** electron-builder が公証するのは DMG に入れる前のアプリだけなので、
`tools/notarize-dmg.mjs` で DMG も公証して staple する。

- アプリを公証して staple → 取り出したアプリがネット無しでも起動できる
- DMG を公証して staple → ダウンロードした DMG を開く時点の判定も通る

どちらか片方だと、条件によっては警告が出る。両方やっておけば受け取り側の操作は
「ダブルクリックするだけ」になる。

#### 資格情報の預け方

**App 用パスワードをファイルに書かない。** キーチェーンに預けて名前で参照する。
リポジトリが公開されているため、うっかりコミットする事故を最初から起こさない。

```sh
# 一度だけ。App 用パスワードは appleid.apple.com で作る
xcrun notarytool store-credentials mdview --team-id <チーム ID>

# ビルド時は名前だけ渡す（これは秘密ではない）
APPLE_KEYCHAIN_PROFILE=mdview npm run dist:mac
```

`APPLE_KEYCHAIN_PROFILE` が無いときは公証を飛ばすので、`npm run dist`（開発中の確認用）は
資格情報なしでも動く。

公証には時間がかかる。3 アーキ × アプリと DMG で 6 回の提出になり、全体で 15〜30 分ほど。

#### 証明書が無い環境では

`build/after-pack.cjs` がアドホック署名を付ける（Developer ID があるときは
electron-builder の署名で上書きされるだけなので何もしない）。

署名の無いバンドルは、ダウンロードで付く隔離属性と組み合わさると
**「壊れているため開けません」** になり、利用者側に回避する手立てがない。
アドホック署名があれば「開発元を検証できない」という通常の警告に留まり、
システム設定から許可して起動できる。実際に確かめた違い:

| | 署名なし | アドホック署名 | Developer ID + 公証 |
|---|---|---|---|
| `codesign --verify` | 署名されていない | 成功 | 成功 |
| `spctl -a` | rejected | rejected | **accepted** |
| 受け取り側の操作 | 起動できない | システム設定から許可 | **ダブルクリックのみ** |

#### GitHub Releases へ上げる

```sh
node tools/publish-release.mjs --dry-run   # 何を上げるか見るだけ
npm run release                            # 上げる
npm run release -- --draft                 # 下書きにして、内容を見てから公開する
```

`dist/release/` の中身をそのまま添付する。リリースノートは直前のタグからの
`git log` と、導入手順・報告先・ライセンスの案内から組み立てる
（自分で書いたものを使うなら `-- --notes notes.md`）。

**送る前に全部確かめてから送る。** 一度公開した配布物は、ダウンロードされた後では
引っ込められない。`tools/publish-release.mjs` は次が揃わなければ何も送らない。

| 見るところ | 止める事故 |
|---|---|
| DMG のファイル名に `package.json` の版が入っているか | 版を上げ忘れた配布物を新しい版として出す |
| SHA256SUMS.txt と実ファイルのハッシュが一致するか | コピーの途中で壊れたものを配る |
| `codesign --verify` / `stapler validate` / `spctl` | 署名・公証されていないものを配る |
| タグが origin にあり、HEAD を指しているか | リリースと中身の対応が後から追えなくなる |
| 作業ツリーがきれいか | 手元にしかない変更から作った配布物を出す |
| README などの版が `package.json` と一致するか | 古いファイル名を案内したまま配る |

**CI では作らない。** ビルドを GitHub Actions に移すには Developer ID の秘密鍵を
リポジトリの Secrets に入れることになる。鍵は証明書のある端末から出さない方針なので、
**作るのは手元、上げるのだけ `gh`** という分担にしている。
`gh auth login` の認証情報も手元のキーチェーンにある。

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

---

## ライセンス

本体は MIT（[LICENSE](LICENSE)、著作権者は Hiroshi Suda）。`package.json` の
`license` も合わせてある。

同梱ライブラリの表示 `THIRD-PARTY-NOTICES.md` は **`tools/licenses.mjs` が作る**。
手で編集しない。

```sh
npm run licenses                  # 作り直す
node tools/licenses.mjs --check   # 古かったら異常終了する
```

**依存を足したり上げたりしたら作り直してコミットする。** バイナリを配る以上、
組み込んだものの表示を欠かすと MIT/BSD/Apache のいずれにも反する。

数え方の約束:

- 対象は **配布物に入るもの**だけ。`tools/licenses.mjs` の `ROOTS`（レンダラと
  メインのバンドルに入るライブラリ）から `dependencies` を辿った閉包を採る。
- ビルド道具（vite, electron-builder, vitest …）と `@types/*` は実行時のコードを
  持たないので数えない。
- 木揺すりで実際には落ちたものも数える。**過剰に表示することはあっても、漏らさない。**
- npm の外から来るものは `EXTRA` に手で書く。Electron（Chromium / Node.js を含む）と、
  `@viz-js/viz` の WebAssembly に焼き込まれている Graphviz・Expat がこれにあたる。
- `package.json` に `license` が無いものは `OVERRIDE` に根拠付きで書く
  （現状は `khroma` の 1 件）。

出来たものは `build.extraResources` でアプリの `Contents/Resources/` に入り、
`tools/make-release.mjs` が `dist/release/` にも置く。バイナリだけを受け取った人にも
条件が届くようにするため。

## 不具合の報告

[Issues](https://github.com/sudahiroshi/mdview/issues) で受ける。
`.github/ISSUE_TEMPLATE/` に不具合用と要望用の様式を置いてある。

不具合の様式が版と環境を訊くのは、`printToPDF` とファイル API の挙動が
macOS とブラウザの版で変わるため。Markdown を貼ってもらう欄には
**公開したくない内容を貼らないよう**注意書きを添えてある（Issue は誰でも読める）。
