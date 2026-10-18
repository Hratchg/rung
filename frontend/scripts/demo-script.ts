// Writes docs/demo-script.md and docs/demo-script.srt from the demo timeline.
// npm run demo-script writes them. npm run demo-script -- --check fails if they are out of date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { demoMarkdown, demoSubtitles } from '../src/demoDocs.ts'

const docs = new URL('../../docs/', import.meta.url)
const files: [string, string][] = [
  ['demo-script.md', demoMarkdown()],
  ['demo-script.srt', demoSubtitles()],
]
const check = process.argv.includes('--check')

let stale = 0
for (const [name, text] of files) {
  const path = new URL(name, docs)
  if (!check) {
    writeFileSync(path, text)
    console.log(`wrote docs/${name}`)
    continue
  }
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
    stale += 1
    console.error(`docs/${name} is out of date. Run npm run demo-script in frontend.`)
  }
}
process.exit(stale ? 1 : 0)
