import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Radio, WifiOff } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppState, type State } from './api'
import { AuditPanel, TwistPanel } from './Audit'
import BoxCard from './BoxCard'
import { NIGHT_COPY, eventLine } from './copy'
import DemoDock from './Demo'
import GateScreen from './Gate'
import { PromptPanel } from './Prompts'
import Queue from './Queue'
import { laneList, sayTime } from './format'
import { BadgeChip, Hint } from './ui'

type Route = { name: 'queue' } | { name: 'gate' } | { name: 'box'; number: string }
type Panel = { kind: 'audit'; box: string } | { kind: 'twist' } | { kind: 'prompt' } | null

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

function clockParts(iso: string) {
  const [date, rest] = iso.split('T')
  const [, month, day] = date.split('-').map(Number)
  return { date: `${MONTHS[month - 1]} ${day}`, time: rest.slice(0, 5) }
}

function Stat({ label, value, tone = '', hint }: { label: string; value: string; tone?: string; hint: string }) {
  return (
    <Hint text={hint}>
      <span tabIndex={0} className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="opacity-75">{label}</span>
        <span className={`text-lg font-bold tabular-nums ${tone}`}>{value}</span>
      </span>
    </Hint>
  )
}

const POLLER_TEXT: Record<string, string> = {
  starting: 'Terminal49 starting. Simulated data for now',
  no_key: 'All data simulated',
  no_read: 'All data simulated',
  unauthorized: 'Terminal49 refused the key. Simulated data',
  error: 'Terminal49 unreachable. Simulated data',
}

function DataChip({ state }: { state: State }) {
  const p = state.poller
  const ok = p.status === 'ok' && p.live_count > 0
  const legend = `Every source field carries a badge. Live: ${state.legend.live}. Simulated: ${state.legend.simulated}.`
  return (
    <Hint text={`${legend} ${p.message ?? ''}`.trim()}>
      <span tabIndex={0} className="flex items-center gap-2 whitespace-nowrap">
        {ok && <BadgeChip kind="live" />}
        <BadgeChip kind="simulated" />
        <span className="opacity-85">{ok ? `Terminal49 live for ${p.live_count} boxes. The rest simulated` : (POLLER_TEXT[p.status] ?? p.message)}</span>
      </span>
    </Hint>
  )
}

function Tab({ href, active, onClick, children }: { href?: string; active: boolean; onClick?: () => void; children: ReactNode }) {
  const cls = `flex h-10 items-center rounded-lg px-3 text-lg font-semibold ${active ? 'bg-current/15 ring-2 ring-current/50' : 'opacity-85 hover:bg-current/10 hover:opacity-100'}`
  return href ? (
    <a href={href} className={cls} aria-current={active ? 'page' : undefined}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  )
}

function AlertStrip({ state }: { state: State }) {
  const latest = state.event_log[0]
  const dark = state.dark_feed
  if (!latest && dark.length === 0) return null
  return (
    <div className="flex flex-col">
      {dark.map((line) => (
        <p key={`${line.cause}-${line.source}`} role="status" className="flex flex-wrap items-center gap-x-3 bg-red-700 px-4 py-1.5 text-white">
          <WifiOff className="size-5" aria-hidden />
          <strong className="text-lg">{line.text}</strong>
          <span>
            {line.cause === 'scenario'
              ? `Rung keeps running from the ${sayTime(line.since)} snapshot. Boxes that need this feed wait. Trucks due now come to you.`
              : line.detail}
          </span>
        </p>
      ))}
      {latest && (
        <p className="flex items-center gap-2 border-t border-current/10 px-4 py-1 opacity-90">
          <Radio className="size-4" aria-hidden />
          <span className="opacity-75">Latest event</span>
          <span className="font-semibold">{eventLine(latest)}</span>
        </p>
      )}
    </div>
  )
}

function Header({ state, route, panel, onPanel }: { state: State; route: Route; panel: Panel; onPanel: (p: Panel) => void }) {
  const { time, date } = clockParts(state.clock)
  const harbor = state.mode === 'harbor_night'
  const night = NIGHT_COPY[state.mode] ?? { name: state.mode, tagline: '' }
  const closed = Array.from({ length: state.lanes }, (_, i) => i + 1).filter((l) => !state.lanes_open.includes(l))
  const c = state.counters
  const auditBox = route.name === 'box' ? route.number : ''
  return (
    <header className={`sticky top-0 z-20 shadow-md ${harbor ? 'bg-indigo-950 text-white' : 'bg-white text-slate-900'}`}>
      <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-1 px-4 py-1.5">
        <a href="#/" className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight">Rung</span>
          <span className="text-lg opacity-75">Gate triage at {state.terminal}</span>
        </a>
        <span className="flex items-center gap-2">
          <span className={`rounded-md px-3 py-0.5 text-lg font-bold ${harbor ? 'bg-amber-300 text-indigo-950' : 'bg-sky-100 text-sky-900'}`}>{night.name}</span>
          <span className="opacity-75">{night.tagline}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{time}</span>
          <span className="opacity-75">{date}</span>
        </span>
        <span className="text-lg">
          Lanes open <strong>{state.lanes_open.length}</strong> of {state.lanes}
          {closed.length > 0 && <span className={`ml-2 font-semibold ${harbor ? 'text-amber-300' : 'text-amber-700'}`}>Closed {laneList(closed)}</span>}
        </span>
        <nav className="ml-auto flex items-center gap-1" aria-label="Screens">
          <Tab href="#/" active={route.name !== 'gate'}>
            Queue
          </Tab>
          <Tab href="#/gate" active={route.name === 'gate'}>
            Gate plan
          </Tab>
          <Tab active={panel?.kind === 'audit'} onClick={() => onPanel(panel?.kind === 'audit' ? null : { kind: 'audit', box: auditBox })}>
            Audit log
          </Tab>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-current/10 px-4 py-1">
        <span className="font-semibold opacity-75">Tonight so far</span>
        <Stat label="Released" value={String(c.released)} hint="Trucks that have left the gate since the shift started." />
        <Stat label="Reefers powered" value={String(c.reefers_powered)} hint="Refrigerated boxes with power on, or already gone on a truck." />
        <Stat
          label="Reefers past safe temperature"
          value={String(c.reefers_lost)}
          tone={c.reefers_lost > 0 ? (harbor ? 'text-red-300' : 'text-red-700') : ''}
          hint="Reefers whose cargo has warmed past its loss limit."
        />
        <Stat label="Demurrage avoided" value={`${c.demurrage_avoided_usd.toLocaleString('en-US')} USD`} hint="Storage fees saved by releasing boxes before more fees accrue." />
        <Stat label="Bookings kept" value={`${c.throughput_pct}%`} hint="Share of the bookings for tonight that still have a gate slot." />
        <span className="ml-auto">
          <DataChip state={state} />
        </span>
      </div>
      <AlertStrip state={state} />
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
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen pb-24">
        <Header state={state.data} route={route} panel={panel} onPanel={setPanel} />
        {state.isError && <p className="bg-red-100 px-4 py-2 text-red-900">Lost contact with the Rung server. Showing the last update.</p>}
        {route.name === 'box' && <BoxCard key={route.number} number={route.number} onAudit={(box) => setPanel({ kind: 'audit', box })} onPrompt={() => setPanel({ kind: 'prompt' })} />}
        {route.name === 'gate' && <GateScreen />}
        {route.name === 'queue' && <Queue carriers={state.data.carriers} />}
        <AuditPanel open={panel?.kind === 'audit'} key={panel?.kind === 'audit' ? panel.box : 'audit'} initialBox={panel?.kind === 'audit' ? panel.box : ''} onClose={closePanel} />
        <TwistPanel open={panel?.kind === 'twist'} onClose={closePanel} />
        <PromptPanel open={panel?.kind === 'prompt'} onClose={closePanel} />
        <DemoDock state={state.data} onTwist={() => setPanel({ kind: 'twist' })} onPrompt={() => setPanel({ kind: 'prompt' })} />
      </div>
    </TooltipProvider>
  )
}
