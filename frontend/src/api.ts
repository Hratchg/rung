import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const STEPS = ['RELEASE', 'WATCH', 'ASK', 'SLOW', 'HOLD', 'HAND'] as const
export type Step = (typeof STEPS)[number]
export const SOURCE_NAMES = ['carrier', 'terminal', 'customs', 'weighbridge', 'reefer'] as const
export type SourceName = (typeof SOURCE_NAMES)[number]
export type Badge = 'live' | 'simulated' | null

export type Counters = {
  released: number
  released_blunt: number
  reefers_powered: number
  reefers_lost: number
  demurrage_avoided_usd: number
  throughput_pct: number
}

export type Poller = {
  live_count: number
  last_ok: string | null
  status: string
  message?: string
}

export type ScenarioEvent = {
  t?: string
  type: string
  at?: string
  fired?: boolean
  [key: string]: unknown
}

export type State = {
  terminal: string
  clock: string
  clock_start: string
  offset: string
  minutes_per_second: number
  mode: string
  lanes: number
  lanes_open: number[]
  dark_sources: string[]
  counters: Counters
  legend: { live: string; simulated: string }
  poller: Poller
  carriers: string[]
  scripted_events: ScenarioEvent[]
  powered_reefers: string[]
}

export type Planner = {
  action: 'approve' | 'override'
  step: Step
  note: string
  engine_step: Step
  at: string
}

export type Clocks = {
  lfd: { date: string; hours: number; label: string } | null
  reefer: { power_on: boolean; product_temp_c: number; set_point_c: number; label: string } | null
  appointment: { lane: number; window: string; at: string; hours: number; lane_closed: boolean; label: string } | null
}

export type QueueRow = {
  number: string
  equipment_type: string
  equipment_length: number | null
  urgency: number
  step: Step
  engine_step: Step
  hand: boolean
  reason: string
  owner: string | null
  pinned: boolean
  fired: string[]
  conflicts: string[]
  planner: Planner | null
  live: boolean
  dray_carrier: string | null
  clocks: Clocks
  badges: Record<SourceName, Badge>
}

export type ConflictInfo = {
  code: string
  sources: string[]
  values: Record<string, unknown>
  sentence: string
}

export type FiredRule = {
  id: string
  name: string
  step: Step
  why: string
  file: string
  twist_tag: string | null
}

export type SourceDetail = {
  fields: Record<string, unknown>
  observed_at: string | null
  age: string
  age_h: number | null
  trust: number
  trust_reason: string
  badge: Badge
  dark: boolean
}

export type EffectiveDecision = {
  box: string
  step: Step
  engine_step: Step
  hand: boolean
  urgency: number
  fired: string[]
  conflicts: string[]
  trust: Record<SourceName, number>
  reason: string
  owner: string | null
  pinned: boolean
  planner: Planner | null
  released_at: string | null
}

export type Warmup = {
  kind: 'frozen' | 'chilled' | 'produce'
  limit_c: number
  note: string
  power_on: boolean
  off_since: string | null
  hours_off: number
  limit_at: string | null
  hours_left: number | null
}

export type AuditLine = {
  seq: number
  ts: string
  box: string
  step: Step
  hand: boolean
  previous_step: Step | null
  fired: string[]
  conflicts: string[]
  urgency: number
  trust: Record<SourceName, number>
  reason: string
  owner: string | null
  actor: 'engine' | 'planner' | string
  override: boolean
  note: string
  twist_tag: string | null
  action?: string
  effect?: string
}

export type BoxDetail = {
  number: string
  live: boolean
  equipment_type: string
  equipment_length: number | null
  appointment: { lane: number; window: string; dray_carrier: string; trucker_phone: string; no_show: boolean; at: string } | null
  mode: string
  sources: Record<SourceName, SourceDetail | null>
  conflicts: ConflictInfo[]
  fired: FiredRule[]
  decision: EffectiveDecision
  clocks: Clocks
  warmup: Warmup | null
  history: AuditLine[]
  call: unknown
}

export type TwistAdded = { kind: string; id: string | null; name: string; file: string; created_at: string | null }

export type Twist = {
  tag: string
  text: string
  received_at: string | null
  received_wall: string | null
  merged_at: string | null
  added: TwistAdded[]
  status: 'received' | 'merged'
}

export type AuditPayload = { lines: AuditLine[]; total: number; twists: Twist[] }

export type DecisionBody = {
  box: string
  action: 'approve' | 'override'
  step?: Step
  note?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // keep the status text
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export function useAppState() {
  return useQuery({ queryKey: ['state'], queryFn: () => request<State>('/api/state') })
}

export function useQueue(filters: { carrier: string; step: string }) {
  const params = new URLSearchParams()
  if (filters.carrier) params.set('carrier', filters.carrier)
  if (filters.step) params.set('step', filters.step)
  const qs = params.toString()
  return useQuery({
    queryKey: ['queue', filters],
    queryFn: () => request<QueueRow[]>(`/api/queue${qs ? `?${qs}` : ''}`),
    placeholderData: (previous) => previous,
  })
}

export function useBox(number: string) {
  return useQuery({
    queryKey: ['box', number],
    queryFn: () => request<BoxDetail>(`/api/box/${encodeURIComponent(number)}`),
    placeholderData: (previous) => (previous?.number === number ? previous : undefined),
    retry: (count, error) => !error.message.includes('not found') && count < 1,
  })
}

export function useAudit(filters: { box: string; limit: number }) {
  const params = new URLSearchParams({ limit: String(filters.limit) })
  if (filters.box) params.set('box', filters.box)
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => request<AuditPayload>(`/api/audit?${params.toString()}`),
    placeholderData: (previous) => previous,
  })
}

function useRefreshAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useDecision() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: (body: DecisionBody) => post('/api/decision', body), onSuccess: refresh })
}

export function useScenarioControls() {
  const refresh = useRefreshAll()
  const reset = useMutation({ mutationFn: () => post('/api/scenario/reset', {}), onSuccess: refresh })
  const speed = useMutation({
    mutationFn: (minutes_per_second: number) => post('/api/scenario/speed', { minutes_per_second }),
    onSuccess: refresh,
  })
  const fire = useMutation({
    mutationFn: (event: ScenarioEvent) => post('/api/scenario/event', event),
    onSuccess: refresh,
  })
  return { reset, speed, fire }
}
