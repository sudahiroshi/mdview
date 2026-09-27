// tako:run: node tools/probe.mjs '<評価する JS 式>' [対象]
// 起動中の mdview（MDVIEW_DEBUG_PORT=9222 付き）に接続し、レンダラで式を評価して結果を表示する。
//
// 複数ウインドウがあるときは第 2 引数で選ぶ。
//   数字        … 上から数えた番号（0 起点）
//   それ以外    … タイトルに含まれる文字列
//   省略        … 1 枚目。ただし 2 枚以上あるときは一覧を出して知らせる
const port = process.env.MDVIEW_DEBUG_PORT ?? '9222'
const expr = process.argv[2] ?? 'document.title'
const want = process.argv[3]

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (pages.length === 0) {
  console.error('レンダラのターゲットが見つかりません')
  process.exit(1)
}

let page
if (want === undefined) {
  page = pages[0]
  if (pages.length > 1) {
    console.error(`ウインドウが ${pages.length} 枚あります（1 枚目を見ます）:`)
    pages.forEach((p, i) => console.error(`  [${i}] ${p.title}`))
  }
} else if (/^\d+$/.test(want)) {
  page = pages[Number(want)]
} else {
  page = pages.find((p) => p.title.includes(want))
}
if (!page) {
  console.error(`対象「${want}」に当たるウインドウがありません。あるのは:`)
  pages.forEach((p, i) => console.error(`  [${i}] ${p.title}`))
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})

const result = await new Promise((res, rej) => {
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id === 1) (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))
  }
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true }
    })
  )
})
ws.close()

if (result.exceptionDetails) {
  console.error('評価時に例外:', result.exceptionDetails.text, result.exceptionDetails.exception?.description ?? '')
  process.exit(1)
}
const v = result.result.value
console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2))
