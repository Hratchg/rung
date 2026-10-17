import { useCallback, useEffect, useState } from 'react'
import { useAppState, useRatedToggle, useScenarioControls, type ScenarioEvent, type State } from './api'
import { AuditPanel, TwistPanel } from './Audit'
import BoxCard from './BoxCard'
import GateScreen from './Gate'
import Queue from './Queue'
import { laneList, sayTime } from './format'
import { BadgeChip } from './ui'

type Route = { name: 'queue' } | { name: 'gate' } | { name: 'box'; number: string }
type Panel = { kind: 'audit'; box: string } | { kind: 'twist' } | null

function parseHash(hash: string): Route {
  const box = hash.match(/^#\/box\/([A-Za-z0-9]+)/)
  if (box) return { name: 'box', number: box[1].toUpperCase() }
  if (/^#\/gate\b/.test(hash)) return { name: 'gate' }
  return { name: 'queue' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SPEEDS = [0, 1, 2, 5, 10]

function clockParts(iso: string) {
  const [date, rest] = iso.split('T')
  const [, month, day] = date.split('-').map(Number)
  return { date: `${MONTHS[month - 1]} ${day}`, time: rest.slice(0, 5) }
}

function payload(event: ScenarioEvent): ScenarioEvent {
  const { t: _t, at: _at, fired: _fired, ...rest } = event
  return rest as ScenarioEvent
}

function Counter({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-current/20 bg-white/5 px-3 py-1">
      <span className="text-base opacity-80">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      {detail && <span className="text-base opacity-80">{detail}</span>}
    </div>
  )
}

const POLLER_SHORT: Record<string, string> = {
  starting: 'Terminal49 starting',
  no_key: 'No Terminal49 key. Fixture data',
  no_read: 'Fixture mode. Terminal49 key has no read access',
  unauthorized: 'Terminal49 refused the key. Fixture data',
  error: 'Terminal49 unreachable. Fixture data',
}

const FIXTURE_MODE = ['no_key', 'no_read']

function PollerChip({ poller }: { poller: State['poller'] }) {
  const ok = poller.status === 'ok'
  const tone = ok ? 'bg-emerald-100 text-emerald-900' : FIXTURE_MODE.includes(poller.status) ? 'bg-slate-200 text-slate-900' : 'bg-amber-100 text-amber-950'
  return (
    <span title={poller.message} className={`rounded-md px-2 py-1 text-base font-semibold ${tone}`}>
      {ok ? `Terminal49 live. ${poller.live_count} boxes` : POLLER_SHORT[poller.status] ?? poller.message}
    </span>
  )
}

type ReeferAction = 'power' | 'trip' | 'telemetry' | 'fail'

const FAULT_ALARM = 'compressor fault'

function reeferEvent(action: ReeferAction, box: string, circuit: string | null): ScenarioEvent {
  if (action === 'trip') return { type: 'circuit_trip', circuit }
  if (action === 'telemetry') return { type: 'reefer_silent', box }
  if (action === 'fail') return { type: 'reefer_silent', box, alarm: FAULT_ALARM }
  return { type: 'reefer_power_off', box }
}

function appliedNote(applied: ScenarioEvent | undefined): string | null {
  if (!applied) return null
  if (typeof applied.ignored === 'string') return `Ignored, ${applied.ignored}.`
  if (applied.type === 'circuit_trip' && Array.isArray(applied.boxes)) {
    return `Circuit ${String(applied.circuit)} tripped. ${applied.boxes.length} units go silent one minute apart.`
  }
  return null
}

function ReeferControls({ state, busy, onFire }: { state: State; busy: boolean; onFire: (e: ScenarioEvent) => void }) {
  const healthy = state.reefers.filter((r) => r.power_on && !r.silent)
  const [reefer, setReefer] = useState('')
  const [action, setAction] = useState<ReeferAction>('power')
  const target = healthy.find((r) => r.number === reefer) ?? healthy[0]
  if (!target) return null
  const select = 'rounded-md border border-current/40 bg-transparent px-2 py-1 [&>option]:text-slate-900'
  const actions: [ReeferAction, string][] = [
    ['power', 'Cut power'],
    ['trip', target.circuit ? `Trip circuit ${target.circuit}` : 'Trip circuit'],
    ['telemetry', 'Drop telemetry'],
    ['fail', 'Fail the unit'],
  ]
  return (
    <span className="flex items-center gap-1">
      <select aria-label="Reefer" className={`${select} font-mono`} value={target.number} onChange={(e) => setReefer(e.target.value)}>
        {healthy.map((r) => (
          <option key={r.number} value={r.number}>
            {r.number}
            {r.circuit ? ` ${r.circuit}` : ''}
          </option>
        ))}
      </select>
      <select aria-label="Reefer action" className={`${select} font-semibold`} value={action} onChange={(e) => setAction(e.target.value as ReeferAction)}>
        {actions.map(([id, label]) => (
          <option key={id} value={id} disabled={id === 'trip' && !target.circuit}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="rounded-md border border-current/40 px-3 py-1 font-semibold hover:bg-white/10 disabled:opacity-50"
        disabled={busy}
        onClick={() => onFire(reeferEvent(action, target.number, target.circuit))}
      >
        Apply
      </button>
    </span>
  )
}

function RatedToggle({ rated, harbor }: { rated: State['rated']; harbor: boolean }) {
  const toggle = useRatedToggle()
  if (!rated.available) return null
  const by = sayTime(rated.deadline)
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={rated.on}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!rated.on)}
        title={`${rated.boxes.length} rated boxes: ${rated.boxes.join(', ')}. Plus 50 urgency and a gate out deadline at ${by}.`}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1 font-semibold disabled:opacity-50 ${
          rated.on ? 'border-amber-300 bg-amber-300 text-indigo-950' : harbor ? 'border-current/40 hover:bg-white/10' : 'border-slate-400 hover:bg-slate-100'
        }`}
      >
        <span className={`relative h-5 w-9 rounded-full ${rated.on ? 'bg-indigo-950' : 'bg-current/30'}`}>
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full transition-[left] duration-150 ${rated.on ? 'left-[18px] bg-amber-300' : 'left-0.5 bg-white'}`}
          />
        </span>
        <span>
          Rated orders {rated.on ? 'on' : 'off'}
          {rated.on && <span className="font-normal">. {rated.boxes.length} boxes out by {by}</span>}
        </span>
      </button>
      {toggle.error && <span className="rounded bg-red-100 px-2 py-1 text-red-900">{toggle.error.message}</span>}
    </span>
  )
}

function DarkFeedBanner({ lines }: { lines: State['dark_feed'] }) {
  if (lines.length === 0) return null
  return (
    <div role="status" className="-mx-4 -mb-3 mt-3 flex flex-col gap-1 bg-red-700 px-4 py-2 text-white">
      {lines.map((line) => (
        <p key={`${line.cause}-${line.source}`} className="flex flex-wrap items-baseline gap-x-3">
          <span className="rounded bg-white px-2 font-bold text-red-800">Dark feed</span>
          <strong className="text-xl tabular-nums">{line.text}</strong>
          <span className="text-base">{line.detail}</span>
        </p>
      ))}
    </div>
  )
}

function Controls({ state }: { state: State }) {
  const { reset, speed, fire } = useScenarioControls()
  const scripted = (type: string) => state.scripted_events.find((e) => e.type === type)
  const lanesEvent = scripted('lanes_down')
  const holdEvent = scripted('hold_placed')
  const darkEvent = scripted('source_dark')

  const lanes = (lanesEvent?.lanes as number[] | undefined) ?? []
  const lanesClosed = lanes.length > 0 && lanes.every((l) => !state.lanes_open.includes(l))
  const darkSource = (darkEvent?.source as string | undefined) ?? 'terminal'
  const isDark = state.dark_sources.includes(darkSource)
  const busy = reset.isPending || fire.isPending || speed.isPending
  const button = 'rounded-md border border-current/40 px-3 py-1 font-semibold hover:bg-white/10 disabled:opacity-50'
  const error = reset.error ?? fire.error ?? speed.error
  const note = fire.isSuccess ? appliedNote(fire.data.applied) : null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => reset.mutate()}>
        Reset
      </button>
      <label className="flex items-center gap-2">
        <span className="opacity-80">Speed</span>
        <select
          className="rounded-md border border-current/40 bg-transparent px-2 py-1 font-semibold [&>option]:text-slate-900"
          value={state.minutes_per_second}
          onChange={(e) => speed.mutate(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Paused' : `${s} min/s`}
            </option>
          ))}
        </select>
      </label>
      {lanesEvent && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => fire.mutate({ type: lanesClosed ? 'lanes_up' : 'lanes_down', lanes })}
        >
          {lanesClosed ? 'Reopen' : 'Close'} lanes {laneList(lanes)}
        </button>
      )}
      {holdEvent && (
        <button type="button" className={button} disabled={busy} onClick={() => fire.mutate(payload(holdEvent))}>
          Hold {String(holdEvent.box)}
        </button>
      )}
      <ReeferControls state={state} busy={busy} onFire={(e) => fire.mutate(e)} />
      {darkEvent && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => fire.mutate({ type: isDark ? 'source_back' : 'source_dark', source: darkSource })}
        >
          {`${darkSource.charAt(0).toUpperCase()}${darkSource.slice(1)} feed ${isDark ? 'back' : 'dark'}`}
        </button>
      )}
      {error && <span className="rounded bg-red-100 px-2 py-1 text-red-900">{error.message}</span>}
      {note && <span className="rounded bg-amber-100 px-2 py-1 text-amber-950">{note}</span>}
    </div>
  )
}

function Nav({ route, panel, onPanel }: { route: Route; panel: Panel; onPanel: (p: Panel) => void }) {
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 font-semibold ${active ? 'bg-current/15 ring-2 ring-current/60' : 'border border-current/40 hover:bg-white/10'}`
  const auditBox = route.name === 'box' ? route.number : ''
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Screens">
      <a href="#/" className={tab(route.name === 'queue')} aria-current={route.name === 'queue' ? 'page' : undefined}>
        Queue
      </a>
      <a href="#/gate" className={tab(route.name === 'gate')} aria-current={route.name === 'gate' ? 'page' : undefined}>
        Gate
      </a>
      <button type="button" className={tab(panel?.kind === 'audit')} onClick={() => onPanel(panel?.kind === 'audit' ? null : { kind: 'audit', box: auditBox })}>
        Audit log
      </button>
      <button type="button" className={tab(panel?.kind === 'twist')} onClick={() => onPanel(panel?.kind === 'twist' ? null : { kind: 'twist' })}>
        Twist log
      </button>
    </nav>
  )
}

function Header({ state, route, panel, onPanel }: { state: State; route: Route; panel: Panel; onPanel: (p: Panel) => void }) {
  const { time, date } = clockParts(state.clock)
  const harbor = state.mode === 'harbor_night'
  const closed = Array.from({ length: state.lanes }, (_, i) => i + 1).filter((l) => !state.lanes_open.includes(l))
  const c = state.counters
  return (
    <header className={`sticky top-0 z-20 px-4 py-3 shadow ${harbor ? 'bg-indigo-950 text-white' : 'bg-white text-slate-900'}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="text-2xl font-black tracking-tight">
          Rung <span className="font-semibold opacity-70">at {state.terminal}</span>
        </h1>
        <span className={`rounded-md px-3 py-1 text-lg font-bold ${harbor ? 'bg-amber-300 text-indigo-950' : 'bg-sky-100 text-sky-900'}`}>
          {harbor ? 'Harbor Night' : 'Tuesday'}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{time}</span>
          <span className="text-lg opacity-80">{date}</span>
          <span className="text-lg tabular-nums opacity-70">{state.offset}</span>
        </div>
        <div className="text-lg">
          Lanes open <strong>{state.lanes_open.length}</strong> of {state.lanes}
          {closed.length > 0 && <span className="ml-2 font-semibold text-amber-500">Closed {laneList(closed)}</span>}
        </div>
        <div className="ml-auto">
          <Nav route={route} panel={panel} onPanel={onPanel} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Counter label="Released" value={String(c.released)} />
        <Counter label="Reefers powered" value={String(c.reefers_powered)} detail={`${c.reefers_lost} lost`} />
        <Counter label="Demurrage avoided" value={`${c.demurrage_avoided_usd.toLocaleString('en-US')} USD`} />
        <Counter label="Throughput" value={`${c.throughput_pct}%`} />
        <PollerChip poller={state.poller} />
        <span className="flex items-center gap-2" title={`${state.legend.live}. ${state.legend.simulated}.`}>
          <BadgeChip kind="live" />
          <BadgeChip kind="simulated" />
        </span>
        <div className="ml-auto">
          <RatedToggle rated={state.rated} harbor={harbor} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Controls state={state} />
      </div>
      <DarkFeedBanner lines={state.dark_feed} />
    </header>
  )
}

export default function App() {
  const state = useAppState()
  const route = useRoute()
  const [panel, setPanel] = useState<Panel>(null)
  const closePanel = useCallback(() => setPanel(null), [])
  if (!state.data) {
    return (
      <p className="p-6 text-lg">{state.isError ? 'Cannot reach the Rung server. Retrying every 2 seconds.' : 'Loading Pier 7'}</p>
    )
  }
  return (
    <div className="min-h-screen">
      <Header state={state.data} route={route} panel={panel} onPanel={setPanel} />
      {state.isError && (
        <p className="bg-red-100 px-4 py-2 text-red-900">Lost contact with the Rung server. Showing the last update.</p>
      )}
      {route.name === 'box' && <BoxCard key={route.number} number={route.number} onAudit={(box) => setPanel({ kind: 'audit', box })} />}
      {route.name === 'gate' && <GateScreen />}
      {route.name === 'queue' && <Queue carriers={state.data.carriers} />}
      {panel?.kind === 'audit' && <AuditPanel key={panel.box} initialBox={panel.box} onClose={closePanel} />}
      {panel?.kind === 'twist' && <TwistPanel onClose={closePanel} />}
    </div>
  )
}
