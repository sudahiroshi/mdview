// tako:run: npx electron tools/open-web.mjs http://localhost:5174/
// ブラウザ版の確認用に、素の Chromium ウインドウで URL を開くだけの入れ物。
// preload を差さないので window.api が無く、アプリはブラウザ版として動く。
import { app, BrowserWindow } from 'electron'

const url = process.argv.slice(2).find((a) => a.startsWith('http')) ?? 'http://localhost:5174/'

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 860, webPreferences: { sandbox: true } })
  await win.loadURL(url)
  console.log('開きました:', url)
})

app.on('window-all-closed', () => app.quit())
