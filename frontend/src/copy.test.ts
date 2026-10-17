import { describe, expect, it } from 'vitest'
import * as copy from './copy'
import { promptBlocks, promptParts } from './promptText'

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const CONTRACTION = /\b\w+n['’]t\b|\b(?:it|that|there|what|here|let|who|you|we|they|i)['’](?:s|re|m|ll|ve|d)\b/i
const DASH = /[\u2013\u2014]/

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

const ctx = (fired: string[] = [], conflicts: string[] = []) => ({ fired, conflicts })

describe('UI copy follows the spec', () => {
  it('has no contractions or dashes anywhere in the source', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text.match(CONTRACTION)?.[0], file).toBeUndefined()
      expect(DASH.test(text), file).toBe(false)
    }
  })

  it('has no semicolons or spaced hyphens in JSX text', () => {
    for (const [file, text] of Object.entries(sources)) {
      if (!file.endsWith('.tsx')) continue
      for (const m of text.matchAll(/(?<![=-])>([^<>{}=()]+)</g)) {
        expect(m[1].includes(';'), `${file}: ${m[1].trim()}`).toBe(false)
        expect(/\s-\s/.test(m[1]), `${file}: ${m[1].trim()}`).toBe(false)
      }
    }
  })

  it('has no semicolons in the copy module or its sentences', () => {
    const steps = copy.LADDER
    const contexts = [ctx(), ctx(['R12']), ctx(['R10']), ctx(['R6']), ctx(['R9']), ctx([], ['C2']), ctx([], ['C1']), ctx(['R14']), ctx(['R8']), ctx(['R1']), ctx(['R5']), ctx(['R13']), ctx(['R11'])]
    const generated = steps.flatMap((s) => contexts.flatMap((c) => [copy.nextStepLine(s, 'customs', c), ...Object.values(copy.primaryAction(s, c))]))
    const all = [...strings(Object.values(copy)), ...generated]
    expect(all.length).toBeGreaterThan(100)
    for (const s of all) {
      if (s.startsWith('bg-') || s.startsWith('text-') || s.startsWith('border-')) continue
      expect(s.includes(';'), s).toBe(false)
      expect(CONTRACTION.test(s), s).toBe(false)
    }
  })
})

describe('ladder helpers', () => {
  it('orders the ladder gentlest first and the groups strongest first', () => {
    expect(copy.LADDER).toEqual([...copy.GROUP_ORDER].reverse())
    expect(copy.LADDER.slice(0, 5)).toEqual(['RELEASE', 'WATCH', 'ASK', 'SLOW', 'HOLD'])
  })

  it('gives every step a word, a meaning, and a planner verb', () => {
    for (const step of copy.LADDER) {
      const meta = copy.STEP_META[step]
      expect(meta.word && meta.short && meta.meaning && meta.who).toBeTruthy()
      expect(copy.primaryAction(step, ctx()).label).toBeTruthy()
    }
  })

  it('names the ask by what is missing', () => {
    expect(copy.primaryAction('ASK', ctx([], ['C1'])).label).toBe('Request reweigh')
    expect(copy.primaryAction('ASK', ctx(['R2'])).label).toBe('Pull fresh record')
    expect(copy.primaryAction('ASK', ctx(['R14'])).label).toBe('Alert reefer crew')
  })

  it('turns rule ids into plain tags without repeats', () => {
    expect(copy.issueTags(['R1', 'R2', 'R7'], 'customs', 'HOLD')).toEqual(['Records disagree', 'Hold by customs'])
    expect(copy.issueTags([], null, 'WATCH')).toEqual(['No rule fired'])
  })

  it('labels urgency and trust in words as well as color', () => {
    expect([copy.urgencyLevel(90).label, copy.urgencyLevel(50).label, copy.urgencyLevel(10).label]).toEqual(['High', 'Medium', 'Low'])
    expect([copy.trustLevel(0).label, copy.trustLevel(0.2).label, copy.trustLevel(0.5).label, copy.trustLevel(0.9).label]).toEqual(['None', 'Low', 'Medium', 'High'])
  })

  it('splits reasons into sentences without breaking decimals', () => {
    expect(copy.sentences('Reefer is 2.9 C over. Release it first.')).toEqual(['Reefer is 2.9 C over.', 'Release it first.'])
  })
})

describe('prompt view', () => {
  const prompt = `## Identity
You are the gate desk.
Be brief.

## Weight check call
Trucker: {{trucker_name}}.
1. Say who you are and check that you are speaking with
   {{trucker_name}}.
2. Pick the outcome:
   - confirmed_loaded: the scale is right.
   - unknown: no clear answer.
`

  it('reads headings, numbered steps, bullets, and wrapped lines', () => {
    expect(promptBlocks(prompt)).toEqual([
      { kind: 'heading', text: 'Identity' },
      { kind: 'para', text: 'You are the gate desk. Be brief.' },
      { kind: 'heading', text: 'Weight check call' },
      { kind: 'para', text: 'Trucker: {{trucker_name}}.' },
      { kind: 'step', n: '1', text: 'Say who you are and check that you are speaking with {{trucker_name}}.' },
      { kind: 'step', n: '2', text: 'Pick the outcome:' },
      { kind: 'bullet', text: 'confirmed_loaded: the scale is right.' },
      { kind: 'bullet', text: 'unknown: no clear answer.' },
    ])
  })

  it('marks variables and outcome names', () => {
    expect(promptParts('Call {{trucker_name}} now')).toEqual([
      { kind: 'text', text: 'Call ' },
      { kind: 'variable', text: 'trucker_name' },
      { kind: 'text', text: ' now' },
    ])
    expect(promptParts('confirmed_loaded: the scale is right.')[0]).toEqual({ kind: 'term', text: 'confirmed_loaded' })
    expect(promptParts('Trucker: Ana')[0]).toEqual({ kind: 'text', text: 'Trucker: Ana' })
  })
})
