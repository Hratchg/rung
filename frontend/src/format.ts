import type { Step } from './api'

export const GROUP_ORDER: Step[] = ['HAND', 'HOLD', 'SLOW', 'ASK', 'WATCH', 'RELEASE']

export const STEP_META: Record<Step, { meaning: string; chip: string; rail: string }> = {
  HAND: { meaning: 'A person must decide now', chip: 'bg-violet-700 text-white', rail: 'border-violet-700' },
  HOLD: { meaning: 'Gate release withheld for this box until its outside owner clears it', chip: 'bg-red-700 text-white', rail: 'border-red-700' },
  SLOW: { meaning: 'Keep it moving, later or in another lane', chip: 'bg-amber-400 text-amber-950', rail: 'border-amber-400' },
  ASK: { meaning: 'Get fresher information before acting', chip: 'bg-sky-700 text-white', rail: 'border-sky-700' },
  WATCH: { meaning: 'Do nothing yet and recheck at the next poll', chip: 'bg-slate-600 text-white', rail: 'border-slate-500' },
  RELEASE: { meaning: 'Cleared to dispatch at its slot. Planner confirms with one tap', chip: 'bg-emerald-700 text-white', rail: 'border-emerald-600' },
}

export function laneList(lanes: number[]): string {
  if (lanes.length === 0) return 'none'
  const sorted = [...lanes].sort((a, b) => a - b)
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  if (contiguous && sorted.length > 2) return `${sorted[0]} to ${sorted[sorted.length - 1]}`
  if (sorted.length === 1) return String(sorted[0])
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}
