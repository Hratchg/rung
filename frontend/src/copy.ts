import type { Emissions, IdleCause, ScenarioEvent, Step } from './api'
import { laneList, sayTime } from './format'

/** Strongest first. The queue groups and the override picker use this order. */
export const GROUP_ORDER: Step[] = ['HAND', 'HOLD', 'SLOW', 'ASK', 'WATCH', 'RELEASE']

/** Gentlest first. The ladder strip reads left to right in this order. */
export const LADDER: Step[] = ['RELEASE', 'WATCH', 'ASK', 'SLOW', 'HOLD', 'HAND']

export type StepMeta = {
  word: string
  short: string
  meaning: string
  who: string
  chip: string
  soft: string
  rail: string
  text: string
}

export const STEP_META: Record<Step, StepMeta> = {
  RELEASE: {
    word: 'Release',
    short: 'Cleared to leave',
    meaning: 'No conflict and cleared. The truck leaves at its slot.',
    who: 'You confirm with one tap',
    chip: 'bg-emerald-700 text-white',
    soft: 'bg-emerald-50 border-emerald-300',
    rail: 'border-emerald-600',
    text: 'text-emerald-800',
  },
  WATCH: {
    word: 'Watch',
    short: 'Recheck soon',
    meaning: 'Nothing to do yet. Rung checks the box again at the next update.',
    who: 'Nobody acts',
    chip: 'bg-slate-600 text-white',
    soft: 'bg-slate-50 border-slate-300',
    rail: 'border-slate-500',
    text: 'text-slate-700',
  },
  ASK: {
    word: 'Ask',
    short: 'Get fresher facts',
    meaning: 'Sources disagree. Get fresh information first: a reweigh, a new terminal record, or a call to the trucker.',
    who: 'Rung or its voice agent',
    chip: 'bg-sky-700 text-white',
    soft: 'bg-sky-50 border-sky-300',
    rail: 'border-sky-700',
    text: 'text-sky-800',
  },
  SLOW: {
    word: 'Slow',
    short: 'New slot or lane',
    meaning: 'Keep the truck moving, in a later slot or another lane.',
    who: 'The gate optimizer',
    chip: 'bg-amber-400 text-amber-950',
    soft: 'bg-amber-50 border-amber-300',
    rail: 'border-amber-400',
    text: 'text-amber-900',
  },
  HOLD: {
    word: 'Hold',
    short: 'Waits for its owner',
    meaning: 'The truck stays at the gate until customs, the shipping line, or the terminal clears it. Rung never places or lifts a hold.',
    who: 'You approve',
    chip: 'bg-red-700 text-white',
    soft: 'bg-red-50 border-red-300',
    rail: 'border-red-700',
    text: 'text-red-800',
  },
  HAND: {
    word: 'Hand',
    short: 'You decide now',
    meaning: 'Rung cannot pick a safe step on its own. A person decides now.',
    who: 'You decide',
    chip: 'bg-violet-700 text-white',
    soft: 'bg-violet-50 border-violet-300',
    rail: 'border-violet-700',
    text: 'text-violet-800',
  },
}

export const LADDER_RULES = [
  'Every rule that fits the box votes for a step.',
  'The strongest vote wins. Hold beats Slow, Slow beats Ask, and so on.',
  'A Release vote never beats a safety vote.',
  'Every Hold names its outside owner. Rung never places or lifts a customs, line, or freight hold.',
]

/** Plain words for each rule, so the queue never leads with an id. */
export const RULE_TAGS: Record<string, string> = {
  R0: 'All clear',
  R1: 'Records disagree',
  R2: 'Records disagree',
  R3: 'Weight mismatch',
  R4: 'Weight still unresolved',
  R5: 'Reefer first',
  R6: 'Reefer under hold',
  R7: 'Hold in place',
  R8: 'Hold pending',
  R9: 'Lane closed',
  R10: 'Feed dark',
  R11: 'Last free day close',
  R12: 'Trucker answered',
  R13: 'Rated order',
  R14: 'Reefer silent',
}

export const CONFLICT_COPY: Record<string, { title: string; plain: string }> = {
  C1: { title: 'Weight', plain: 'The manifest and the scale disagree' },
  C2: { title: 'Records', plain: 'Availability and holds disagree' },
  C3: { title: 'Reefer', plain: 'The reefer is in trouble' },
  C4: { title: 'Dark feed', plain: 'A source stopped reporting' },
  C5: { title: 'Clock', plain: 'The last free day is close' },
}

export const ACTOR: Record<string, { label: string; tone: string }> = {
  planner: { label: 'Planner', tone: 'text-violet-800' },
  engine: { label: 'Rung', tone: 'text-slate-700' },
  voice: { label: 'Voice agent', tone: 'text-sky-800' },
  spoof: { label: 'Demo spoof', tone: 'text-fuchsia-800' },
}

/** Tags for a queue row, deduplicated, in rule order. */
export function issueTags(fired: string[], owner: string | null, step: Step): string[] {
  const tags: string[] = []
  for (const id of fired) {
    let tag = RULE_TAGS[id]
    if (!tag) continue
    if (id === 'R7' && owner) tag = `Hold by ${owner}`
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (tags.length === 0) tags.push(step === 'WATCH' ? 'No rule fired' : STEP_META[step].short)
  return tags
}

type Context = { fired: string[]; conflicts: string[] }

const has = (c: Context, ...ids: string[]) => ids.some((id) => c.fired.includes(id) || c.conflicts.includes(id))

/** The verb on the planner's main button. HAND has no default, so it opens the step picker. */
export function primaryAction(step: Step, c: Context): { label: string; hint: string } {
  switch (step) {
    case 'RELEASE':
      return { label: 'Release truck', hint: 'The truck leaves the gate now and drops off the queue.' }
    case 'WATCH':
      return { label: 'Keep watching', hint: 'You agree with Rung. Nothing happens at the gate yet.' }
    case 'ASK':
      if (has(c, 'C2', 'R2')) return { label: 'Pull fresh record', hint: 'Rung pulls the terminal record again.' }
      if (has(c, 'C1')) return { label: 'Request reweigh', hint: 'Rung asks the scale crew for a reweigh.' }
      if (has(c, 'R14')) return { label: 'Alert reefer crew', hint: 'Rung asks the reefer crew to check the unit.' }
      return { label: 'Send the ask', hint: 'Rung records the ask.' }
    case 'SLOW':
      return { label: 'Book new slot', hint: 'Rung books the truck into the slot the optimizer planned.' }
    case 'HOLD':
      return { label: 'Confirm hold', hint: 'The truck stays at the gate. Its owner clears the hold, not Rung.' }
    case 'HAND':
      return { label: 'Decide', hint: 'Pick the step yourself. Your choice goes to the audit log.' }
  }
}

/** One sentence that says what to do next, shown large on the box card. */
export function nextStepLine(step: Step, owner: string | null, c: Context): string {
  switch (step) {
    case 'HAND':
      if (has(c, 'R12')) return 'The trucker backed the scale, so the manifest is wrong. You decide what happens to this box.'
      if (has(c, 'R10')) return 'The terminal feed is dark and this truck is due now. You decide whether it leaves.'
      return 'Rung cannot pick a safe step on its own. You decide.'
    case 'HOLD':
      if (has(c, 'R6')) return `Keep this truck at the gate until the ${owner ?? 'owner'} clears it. The reefer evidence goes with it.`
      return `Keep this truck at the gate until the ${owner ?? 'owner'} clears it.`
    case 'SLOW':
      if (has(c, 'R9')) return 'Its lane is closed. Book the new slot the optimizer found.'
      return 'Keep it moving in a later slot or another lane.'
    case 'ASK':
      if (has(c, 'C2', 'R2')) return 'The records disagree. Pull a fresh terminal record before acting.'
      if (has(c, 'C1')) return 'The weights disagree. Get a reweigh or call the trucker before it leaves.'
      if (has(c, 'R14')) return 'The reefer went quiet. Ask the reefer crew to check it.'
      return 'Get fresher information before acting.'
    case 'WATCH':
      if (has(c, 'R10')) return 'The terminal feed is dark. Rung waits for it before acting.'
      if (has(c, 'R8')) return 'A hold is pending. Rung waits, and the owner has a heads up.'
      if (has(c, 'R1')) return 'The records disagree a little. Rung checks again at the next update.'
      return 'Nothing to do yet. Rung checks again at the next update.'
    case 'RELEASE':
      if (has(c, 'R5')) return 'The reefer is in trouble and nothing holds it. Release it first.'
      if (has(c, 'R13')) return 'Rated order with a deadline. Release it before the deadline.'
      if (has(c, 'R11')) return 'The last free day is close. Release it soon to stop the fees.'
      return 'Cleared. Release the truck at its slot.'
  }
}

/** Split a reason string into sentences. Decimals such as 2.9 never split because no space follows the dot. */
export function sentences(reason: string): string[] {
  return reason
    .split(/(?<=\.)\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function urgencyLevel(value: number): { label: string; bar: string; text: string } {
  if (value >= 70) return { label: 'High', bar: 'bg-red-600', text: 'text-red-800' }
  if (value >= 40) return { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-900' }
  return { label: 'Low', bar: 'bg-slate-400', text: 'text-slate-600' }
}

export function trustLevel(value: number): { label: string; bar: string; text: string } {
  if (value <= 0) return { label: 'None', bar: 'bg-slate-400', text: 'text-slate-700' }
  if (value < 0.3) return { label: 'Low', bar: 'bg-red-600', text: 'text-red-800' }
  if (value < 0.6) return { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-900' }
  return { label: 'High', bar: 'bg-emerald-600', text: 'text-emerald-900' }
}

export const URGENCY_HELP =
  'Urgency runs from 0 to 100 and measures what waiting costs. A warming reefer, a close last free day, demurrage, a hold, and a truck due soon all add points.'

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Plain words for a scenario event, for the latest event line and the demo timeline. */
export function describeEvent(e: ScenarioEvent): string {
  const box = typeof e.box === 'string' ? e.box : ''
  const lanes = Array.isArray(e.lanes) ? laneList(e.lanes as number[]) : ''
  const source = typeof e.source === 'string' ? capital(e.source) : 'A'
  let text: string
  switch (e.type) {
    case 'mode':
      text = e.mode === 'harbor_night' ? 'Harbor Night begins' : 'Back to an ordinary Tuesday'
      break
    case 'lanes_down':
      text = `Lanes ${lanes} closed`
      break
    case 'lanes_up':
      text = `Lanes ${lanes} reopened`
      break
    case 'hold_placed': {
      const hold = e.hold as { name?: string } | undefined
      text = `${capital(hold?.name ?? 'A')} hold placed on ${box}`
      break
    }
    case 'hold_cleared':
      text = `Hold cleared on ${box}`
      break
    case 'reefer_power_off':
      text = `Reefer ${box} lost power`
      break
    case 'reefer_power_on':
      text = `Reefer ${box} has power again`
      break
    case 'source_dark':
      text = `${source} feed went dark`
      break
    case 'source_back':
      text = `${source} feed is back`
      break
    case 'fee_increase':
      text = `Fees went up on ${box}`
      break
    case 'circuit_trip':
      text = `Circuit ${String(e.circuit ?? '')} tripped`
      break
    case 'reefer_silent':
      text = e.alarm ? `Reefer ${box} sent an alarm and went silent` : `Reefer ${box} went silent`
      break
    case 'twist':
      text = `Twist ${String(e.tag ?? '')} arrived`
      break
    default:
      text = capital(String(e.type).replace(/_/g, ' '))
  }
  if (typeof e.ignored === 'string') text += '. No change'
  return text
}

export function eventLine(e: ScenarioEvent): string {
  const at = typeof e.at === 'string' ? sayTime(e.at) : ''
  return at ? `${at} ${describeEvent(e)}` : describeEvent(e)
}

export const NIGHT_COPY: Record<string, { name: string; tagline: string }> = {
  tuesday: { name: 'Tuesday', tagline: 'Ordinary night' },
  harbor_night: { name: 'Harbor Night', tagline: 'Worst night of the year' },
}

export const DEMO_NOTE = 'The presenter drives the scenario here. These controls are not part of the planner app.'

export const PROMPT_COPY = {
  title: 'Voice agent prompt',
  description: 'The exact instructions Rung gives the Retell voice agent before every call. Read live from the setup script, so it always matches the agent.',
  functionsLive: 'The public URL is set, so the agent can look up boxes and record the answer straight into Rung.',
  functionsOff: 'This is the full prompt the setup script sends when a public URL is set. Without one the script leaves out lookup_box and record_outcome, and step 4 tells the trucker a planner will review the answer.',
  analysis: {
    outcome: 'Loaded as weighed, empty as declared, takes a later slot, or unknown',
    callback_needed: 'True when a planner should call the trucker back',
    notes: 'One or two sentences on what the trucker said',
  } as Record<string, string>,
}

export const IDLE_TONE: Record<IdleCause, string> = {
  kept: 'text-emerald-800',
  moved: 'text-amber-900',
  overflow: 'text-red-800',
  hold: 'text-red-800',
  dark: 'text-red-800',
}

/** The factor and its sources, as secondary detail wherever an idle or CO2 number shows. */
export function emissionsNote(e: Emissions | undefined): string {
  if (!e) return 'Modelled, not measured.'
  return `Modelled, not measured. ${e.label} Sources: ${e.sources.map((s) => sourceTitle(s.label)).join(', and ')}.`
}

export function sourceTitle(label: string): string {
  return label.split('. ')[0]
}
