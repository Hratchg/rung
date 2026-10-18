import type { ScenarioEvent, State, Step } from './api'
import { laneList, sayTime } from './format'

export type NightMode = 'everyday' | 'crisis'

export const nightMode = (mode: string): NightMode => (mode === 'harbor_night' ? 'crisis' : 'everyday')

export const MODE_COPY: Record<NightMode, { label: string; line: string; hint: string }> = {
  everyday: {
    label: 'Everyday mode',
    line: 'An ordinary night. Rung works the routine pull list and flags the boxes that need you.',
    hint: 'Everyday mode is an ordinary night shift. Most boxes are cleared to leave, every lane is open, and the gate runs on its bookings.',
  },
  crisis: {
    label: 'Crisis mode',
    line: 'Rung keeps the gate open instead of closing the terminal, and hands you only what needs a person.',
    hint: 'Crisis mode is the worst night of the year. Lanes close, holds land, a reefer warms, and a feed goes dark. Rung re-plans every truck as each one happens.',
  },
}

export type IncidentKind = 'lanes' | 'feed' | 'hold' | 'reefer' | 'silent' | 'rated'

export type Incident = {
  id: string
  kind: IncidentKind
  title: string
  detail: string
  action?: { label: string; href?: string; filter?: Step }
}

export type NightState = Pick<State, 'lanes' | 'lanes_open' | 'dark_feed' | 'event_log' | 'reefers' | 'rated'>

export type NightCounts = { moved?: number; overflow?: number; feedBoxes?: number; feedHand?: number }

const HOLD_OWNER: Record<string, string> = {
  customs: 'customs broker',
  usda: 'customs broker',
  vacis: 'customs broker',
  line: 'shipping line',
  freight: 'shipping line',
  tmf: 'terminal',
}

const HOLD_NAME: Record<string, string> = { usda: 'USDA', vacis: 'VACIS', tmf: 'TMF' }

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function closedLanes(state: Pick<State, 'lanes' | 'lanes_open'>): number[] {
  return Array.from({ length: state.lanes }, (_, i) => i + 1).filter((l) => !state.lanes_open.includes(l))
}

function activeHolds(log: ScenarioEvent[]): { box: string; name: string }[] {
  const holds = new Map<string, string>()
  for (const e of [...log].reverse()) {
    if (typeof e.ignored === 'string' || typeof e.box !== 'string') continue
    if (e.type === 'hold_placed') holds.set(e.box, String((e.hold as { name?: string } | undefined)?.name ?? 'other'))
    if (e.type === 'hold_cleared') holds.delete(e.box)
  }
  return [...holds].map(([box, name]) => ({ box, name }))
}

/** What has gone wrong tonight, in the order a planner should read it. */
export function incidents(state: NightState, counts: NightCounts = {}): Incident[] {
  const out: Incident[] = []
  const closed = closedLanes(state)
  if (closed.length > 0) {
    out.push({
      id: 'lanes',
      kind: 'lanes',
      title: closed.length === 1 ? `Lane ${closed[0]} closed` : `Lanes ${laneList(closed)} closed`,
      detail:
        counts.moved == null
          ? 'Rung moves every booked truck to the best open slot.'
          : `${plural(counts.moved, 'truck')} moved, ${counts.overflow ?? 0} with no slot tonight.`,
      action: { label: 'See the gate plan', href: '#/gate' },
    })
  }
  for (const line of state.dark_feed) {
    const hand = counts.feedHand ?? 0
    out.push({
      id: `feed-${line.source}`,
      kind: 'feed',
      title: line.text,
      detail:
        counts.feedBoxes == null
          ? 'Boxes that need this feed wait. Trucks due now come to you.'
          : `${plural(counts.feedBoxes, 'box', 'boxes')} wait on it. ${hand > 0 ? `${plural(hand, 'truck')} due now come to you.` : 'No truck is due right now.'}`,
      action: hand > 0 ? { label: 'Show the Hand boxes', filter: 'HAND' } : undefined,
    })
  }
  for (const hold of activeHolds(state.event_log)) {
    out.push({
      id: `hold-${hold.box}`,
      kind: 'hold',
      title: `${HOLD_NAME[hold.name] ?? capital(hold.name)} hold on ${hold.box}`,
      detail: `The truck waits until the ${HOLD_OWNER[hold.name] ?? 'terminal'} clears it.`,
      action: { label: 'Open the box', href: `#/box/${hold.box}` },
    })
  }
  const unpowered = state.reefers.filter((r) => !r.power_on)
  if (unpowered.length > 0) {
    const first = unpowered[0].number
    out.push({
      id: 'reefer',
      kind: 'reefer',
      title: unpowered.length === 1 ? `Reefer ${first} has no power` : `${unpowered.length} reefers have no power`,
      detail: unpowered.length === 1 ? 'Its cargo is warming.' : `Their cargo is warming, starting with ${first}.`,
      action: { label: 'Open the box', href: `#/box/${first}` },
    })
  }
  const silent = state.reefers.filter((r) => r.power_on && r.silent)
  if (silent.length > 0) {
    out.push({
      id: 'silent',
      kind: 'silent',
      title: silent.length === 1 ? `Reefer ${silent[0].number} went silent` : `${silent.length} reefers went silent`,
      detail: 'Rung asks the reefer crew to check before anything leaves.',
      action: { label: 'Show the Ask boxes', filter: 'ASK' },
    })
  }
  if (state.rated.on) {
    out.push({
      id: 'rated',
      kind: 'rated',
      title: 'Rated orders on',
      detail: `${plural(state.rated.boxes.length, 'box', 'boxes')} must be out by ${sayTime(state.rated.deadline)}. They get first claim on the gate.`,
      action: { label: 'See the gate plan', href: '#/gate' },
    })
  }
  return out
}

const CRISIS_CAUSE: [string, string][] = [
  ['R9', 'its lane is closed'],
  ['R10', 'a feed it needs is dark'],
  ['R6', 'its reefer is in trouble under a hold'],
  ['R5', 'its reefer is in trouble'],
  ['R14', 'its reefer went silent'],
  ['R13', 'it is a rated order'],
]

/** Why a box looks different tonight, from the rules that fired on it. */
export function crisisCauses(fired: string[]): string[] {
  const causes = CRISIS_CAUSE.filter(([id]) => fired.includes(id)).map(([, text]) => text)
  return causes.includes('its reefer is in trouble under a hold') ? causes.filter((c) => c !== 'its reefer is in trouble') : causes
}

export function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
