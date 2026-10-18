import { describe, expect, it } from 'vitest'
import scriptMarkdown from '../../docs/demo-script.md?raw'
import scriptSubtitles from '../../docs/demo-script.srt?raw'
import { demoMarkdown, demoSubtitles } from './demoDocs'
import { DEMO_CHAPTERS, DEMO_TOTAL, WEIGHT_BOX, WORDS_PER_SECOND, chapterEnd, clock, wordCount } from './demoScript'

const tsx = import.meta.glob('./**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const source = Object.values(tsx).join('\n')
const exact = new Set([...source.matchAll(/data-demo="([^"]+)"/g)].map((m) => m[1]))
const prefixes = [...source.matchAll(/data-demo=\{`([^`$]*)\$\{/g)].map((m) => m[1])

const actions = DEMO_CHAPTERS.flatMap((c) => c.actions)

describe('demo timeline', () => {
  it('starts at zero with chapters in order and every action inside its chapter', () => {
    expect(DEMO_CHAPTERS[0].start).toBe(0)
    DEMO_CHAPTERS.forEach((c, i) => {
      const length = chapterEnd(i) - c.start
      expect(length, c.title).toBeGreaterThan(0)
      for (const a of c.actions) {
        expect(a.at, `${c.title} ${a.do}`).toBeGreaterThanOrEqual(0)
        expect(a.at, `${c.title} ${a.do}`).toBeLessThan(length)
      }
    })
  })

  it('stays under 2:55 so the video stays under 3:00', () => {
    expect(DEMO_TOTAL).toBeLessThan(175)
    expect(DEMO_CHAPTERS[DEMO_CHAPTERS.length - 1].start).toBeLessThan(DEMO_TOTAL)
  })

  it('gives every narration time to be read at a normal pace', () => {
    DEMO_CHAPTERS.forEach((c, i) => {
      const words = wordCount(c.narration)
      expect(words, c.title).toBeGreaterThan(0)
      expect(words, `${c.title}: ${words} words in ${chapterEnd(i) - c.start} s`).toBeLessThanOrEqual(WORDS_PER_SECOND * (chapterEnd(i) - c.start))
    })
  })

  it('targets only elements that carry a data-demo attribute', () => {
    const targets = actions.flatMap((a) => (a.do === 'spot' || a.do === 'click') && a.target ? [a.target] : [])
    expect(targets.length).toBeGreaterThan(20)
    for (const t of targets) expect(exact.has(t) || prefixes.some((p) => p && t.startsWith(p)), t).toBe(true)
  })

  it('shows the Retell prompt and keeps the call simulated', () => {
    expect(actions.some((a) => a.do === 'panel' && a.panel === 'prompt')).toBe(true)
    const call = actions.find((a) => a.do === 'post' && a.path === `/api/call/${WEIGHT_BOX}`)
    expect(call && call.do === 'post' && call.body).toEqual({ mock_outcome: 'confirmed_loaded', simulate: true })
  })

  it('lands the crisis events one jump at a time', () => {
    const jumps = actions.flatMap((a) => (a.do === 'post' && a.path === '/api/scenario/jump' ? [String(a.body.t)] : []))
    expect(jumps).toEqual(['+00:05', '+00:10', '+00:20', '+00:40'])
  })

  it('formats script timestamps', () => {
    expect([clock(0), clock(62), clock(166)]).toEqual(['0:00', '1:02', '2:46'])
  })
})

describe('demo script docs', () => {
  it('match the timeline. Run npm run demo-script after changing it', () => {
    expect(scriptMarkdown).toBe(demoMarkdown())
    expect(scriptSubtitles).toBe(demoSubtitles())
  })

  it('give the Retell prompt timestamp and keep every subtitle inside the demo', () => {
    expect(scriptMarkdown).toContain('At 1:02 the Voice agent prompt drawer')
    const ends = [...scriptSubtitles.matchAll(/--> (\d\d):(\d\d):(\d\d),(\d{3})/g)].map((m) => +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000)
    expect(ends.length).toBeGreaterThan(DEMO_CHAPTERS.length)
    expect(Math.max(...ends)).toBeLessThan(DEMO_TOTAL)
  })
})
