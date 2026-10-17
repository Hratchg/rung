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
  counters_blunt: Omit<Counters, 'released_blunt'>
  legend: { live: string; simulated: string }
  poller: Poller
  carriers: string[]
  scripted_events: ScenarioEvent[]
  powered_reefers: string[]
  reefers: { number: string; circuit: string | null; power_on: boolean; silent: boolean }[]
  voice: { mode: 'mock' | 'web' | 'phone'; missing: string[]; phone_enabled: boolean }
  dark_feed: DarkFeedLine[]
  rated: RatedInfo
}

export type DarkFeedLine = {
  source: string
  cause: 'scenario' | 'poller'
  since: string
  minutes: number
  text: string
  detail: string
}

export type RatedInfo = {
  available: boolean
  on: boolean
  deadline: string | null
  latest_window: string | null
  boxes: string[]
}

export type RatedClock = { deadline: string; hours: number; label: string }

export type SilenceKind = 'tripped' | 'telemetry' | 'failed'

export type Silence = {
  kind: SilenceKind
  since: string
  circuit: string | null
  peers: string[]
  draw_kw: number | null
  alarm: string | null
  label: string
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
  reefer: { power_on: boolean; product_temp_c: number; set_point_c: number; silent: boolean; label: string } | null
  appointment: {
    lane: number
    window: string
    at: string
    hours: number
    lane_closed: boolean
    planned: { lane: number | null; window: string | null; label: string } | null
    label: string
  } | null
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
  rated: RatedClock | null
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
  cause: 'power' | 'fault' | null
  silent_since: string | null
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
  actor: 'engine' | 'planner' | 'voice' | 'spoof' | string
  override: boolean
  note: string
  twist_tag: string | null
  action?: string
  effect?: string
  call_id?: string
  outcome?: CallOutcome | null
  callback_needed?: boolean
}

export type CallOutcome = 'confirmed_empty' | 'confirmed_loaded' | 'reschedule_accepted' | 'unknown'

export type TranscriptLine = { role: 'agent' | 'trucker'; content: string }

export type CallInfo = {
  call_id: string
  mode: 'web' | 'phone'
  mock: boolean
  status: string
  started_at: string
  trucker_name: string
  dray_carrier: string
  transcript: TranscriptLine[]
  outcome: CallOutcome | null
  outcome_label: string | null
  callback_needed: boolean | null
  notes: string
  source: string | null
  recorded_at: string | null
}

export type AskInfo = {
  available: boolean
  mode: 'mock' | 'web' | 'phone'
  default_outcome: CallOutcome
  outcomes: { id: CallOutcome; label: string }[]
  weight_case: string | null
}

export type CallStart = {
  call_id: string
  access_token: string | null
  transport: 'livekit' | 'gateway' | null
  ice_servers: RTCIceServer[]
  mode: 'web' | 'phone'
  mock: boolean
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
  rated: RatedClock | null
  silence: Silence | null
  spoof: SpoofInfo
  call: CallInfo | null
  ask: AskInfo
}

export type SpoofHoldName = 'customs' | 'USDA' | 'VACIS' | 'line' | 'freight' | 'TMF'

export type SpoofInfo = {
  available: boolean
  weight_in_lbs: number | null
  holds: { name: SpoofHoldName; label: string; active: boolean }[]
  spoofed: Record<string, string>
}

export type SpoofBody = { weight_in_lbs?: number; hold?: { name: SpoofHoldName; on: boolean } }

type SpoofSide = { step: Step; trust: Record<SourceName, number> }

export type SpoofResult = { effect: string; before: SpoofSide; after: SpoofSide; decision: EffectiveDecision }

export type TwistAdded = { kind: string; id: string | null; name: string; file: string; created_at: string | null }

export type TwistCommit = {
  sha: string
  short: string
  date: string
  subject: string
  via: 'message' | 'git tag'
  files: { path: string; added: number | null; deleted: number | null }[]
  patch?: string
  truncated: boolean
}

export type Twist = {
  tag: string
  text: string
  received_at: string | null
  received_wall: string | null
  merged_at: string | null
  added: TwistAdded[]
  status: 'received' | 'merged'
  git: { available: boolean; commits: TwistCommit[] }
}

export type AuditPayload = { lines: AuditLine[]; total: number; twists: Twist[] }

export type GateChip = {
  box: string
  urgency: number
  step: Step
  reefer: boolean
  lfd_today: boolean
  rated: boolean
  lane: number
  window: string
}

export type RatedRowStatus = 'released' | 'on_time' | 'late' | 'overflow' | 'held' | 'missed' | 'no_appointment'

export type GateOverflow = GateChip & { reason: string; slid: boolean; slid_from: { lane: number; window: string } | null }

export type GateMove = {
  box: string
  old_lane: number
  old_window: string
  new_lane: number
  new_window: string
  delay_hours: number
  reason: string
  urgency: number
  reefer: boolean
  lfd_today: boolean
}

type CompareSide = Omit<Counters, 'released_blunt'> & { kept: number; reefers_kept: number; lfd_kept: number }

export type Gate = {
  lanes: { id: number; open: boolean }[]
  windows: string[]
  ended_windows: string[]
  capacity: number
  units: number
  placed: Record<string, GateChip & { moved: boolean }>
  moved: GateMove[]
  overflow: GateOverflow[]
  held: (GateChip & { reason: string })[]
  missed: string[]
  rated: RatedInfo & { slid: number; rows: { box: string; status: RatedRowStatus; text: string; urgency: number }[] }
  solve_ms: number
  solver: string
  error: string | null
  compare: {
    appointments: number
    non_hold: number
    reefers_total: number
    lfd_total: number
    rung: CompareSide
    blunt: CompareSide
  }
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

export function useBox(number: string) {
  return useQuery({
    queryKey: ['box', number],
    queryFn: () => request<BoxDetail>(`/api/box/${encodeURIComponent(number)}`),
    placeholderData: (previous) => (previous?.number === number ? previous : undefined),
    retry: (count, error) => !error.message.includes('not found') && count < 1,
  })
}

export function useAudit(filters: { box: string; limit: number; diff?: boolean }) {
  const params = new URLSearchParams({ limit: String(filters.limit) })
  if (filters.box) params.set('box', filters.box)
  if (filters.diff) params.set('diff', 'true')
  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => request<AuditPayload>(`/api/audit?${params.toString()}`),
    placeholderData: (previous) => previous,
  })
}

export function useGate() {
  return useQuery({ queryKey: ['gate'], queryFn: () => request<Gate>('/api/gate'), placeholderData: (previous) => previous })
}

function useRefreshAll() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export function useDecision() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: (body: DecisionBody) => post('/api/decision', body), onSuccess: refresh })
}

export function useStartCall(number: string) {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (mock_outcome: CallOutcome | null) =>
      post<CallStart>(`/api/call/${encodeURIComponent(number)}`, mock_outcome ? { mock_outcome } : {}),
    onSuccess: refresh,
  })
}

export function useSpoof(number: string) {
  const refresh = useRefreshAll()
  return useMutation({
    mutationFn: (body: SpoofBody) => post<SpoofResult>(`/api/box/${encodeURIComponent(number)}/spoof`, body),
    onSuccess: refresh,
  })
}

export function useRatedToggle() {
  const refresh = useRefreshAll()
  return useMutation({ mutationFn: (on: boolean) => post<State>('/api/scenario/rated', { on }), onSuccess: refresh })
}

export function useLaneToggle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { lane: number; open: boolean }) => post<Gate>('/api/gate/lanes', body),
    onSuccess: (gate) => {
      qc.setQueryData(['gate'], gate)
      qc.invalidateQueries()
    },
  })
}

export function useScenarioControls() {
  const refresh = useRefreshAll()
  const reset = useMutation({ mutationFn: () => post('/api/scenario/reset', {}), onSuccess: refresh })
  const speed = useMutation({
    mutationFn: (minutes_per_second: number) => post('/api/scenario/speed', { minutes_per_second }),
    onSuccess: refresh,
  })
  const fire = useMutation({
    mutationFn: (event: ScenarioEvent) => post<State & { applied: ScenarioEvent }>('/api/scenario/event', event),
    onSuccess: refresh,
  })
  return { reset, speed, fire }
}
