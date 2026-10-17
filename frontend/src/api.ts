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
