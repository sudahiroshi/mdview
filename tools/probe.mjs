// tako:run: node tools/probe.mjs '<評価する JS 式>'
// 起動中の mdview（MDVIEW_DEBUG_PORT=9222 付き）に接続し、レンダラで式を評価して結果を表示する。
const port = process.env.MDVIEW_DEBUG_PORT ?? '9222'
const expr = process.argv[2] ?? 'document.title'

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
if (!page) {
  console.error('レンダラのターゲットが見つかりません')
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
