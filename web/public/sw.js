// mdview の Service Worker。
// 目的はオフラインでも起動できるようにすることだけで、文書の内容は一切保持しない。
const CACHE = 'mdview-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  // 入口の HTML は毎回取りに行く。ここを固定するとアプリの更新が届かなくなる
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          void caches.open(CACHE).then((c) => c.put('./index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error()))
    )
    return
  }

  // ハッシュ付きの資材は中身が変わらないので、あるものをそのまま使う
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((res) => {
          if (res.ok) void caches.open(CACHE).then((c) => c.put(request, res.clone()))
          return res
        })
    )
  )
})
