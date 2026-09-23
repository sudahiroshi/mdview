import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const TIMEOUT_MS = 20_000
const MAX_OUTPUT = 32 * 1024 * 1024

/** 同梱 jar の場所。開発時はリポジトリ直下、配布時は .app 内の Resources。 */
function jarPath(): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'plantuml.jar')]
    : [join(app.getAppPath(), 'resources', 'plantuml.jar'), join(process.cwd(), 'resources', 'plantuml.jar')]
  return candidates.find((p) => existsSync(p)) ?? null
}

let javaChecked: boolean | null = null

function hasJava(): Promise<boolean> {
  if (javaChecked !== null) return Promise.resolve(javaChecked)
  return new Promise((resolve) => {
    execFile('java', ['-version'], { timeout: 5000 }, (err) => {
      javaChecked = !err
      resolve(javaChecked)
    })
  })
}

/**
 * PlantUML のソースを SVG に変換する。
 * 公開サーバへは送らず、ローカルの java + 同梱 jar だけで処理する。
 */
export async function renderPlantUml(code: string): Promise<string> {
  const jar = jarPath()
  if (!jar) throw new Error('plantuml.jar が見つかりません。`node tools/fetch-plantuml.mjs` を実行してください。')
  if (!(await hasJava())) throw new Error('java が見つかりません。PlantUML の描画には Java が必要です。')

  return new Promise((resolve, reject) => {
    const child = execFile(
      'java',
      ['-Djava.awt.headless=true', '-jar', jar, '-tsvg', '-pipe', '-charset', 'UTF-8'],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err && !stdout) return reject(new Error(stderr?.trim() || err.message))
        const svg = stdout.slice(stdout.indexOf('<svg'))
        if (!svg.startsWith('<svg')) return reject(new Error(stderr?.trim() || 'SVG を生成できませんでした'))
        resolve(svg)
      }
    )
    child.stdin?.end(code, 'utf8')
  })
}
