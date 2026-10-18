import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Globe, Radio, WifiOff } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppState, useRegionSwitch, type State } from './api'
import { AuditPanel, TwistPanel } from './Audit'
import BoxCard from './BoxCard'
import { NIGHT_COPY, eventLine } from './copy'
import DemoDock from './Demo'
import GateScreen from './Gate'
import { ModePill } from './NightBrief'
import { PromptPanel } from './Prompts'
import Queue from './Queue'
import { sayTime } from './format'
import { setRegion } from './region'
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
  const stub = state.region.adapter !== 'Terminal49'
  const legend = `Every source field carries a badge. Live: ${state.legend.live}. Simulated: ${state.legend.simulated}.`
  const text = ok
    ? `Terminal49 live for ${p.live_count} boxes. The rest simulated`
    : stub
      ? `All data simulated. ${state.region.adapter} adapter not connected`
      : (POLLER_TEXT[p.status] ?? p.message)
  return (
    <Hint text={`${legend} ${stub ? state.region.adapter_note : ''} ${p.message ?? ''}`.replace(/\s+/g, ' ').trim()}>
      <span tabIndex={0} className="flex items-center gap-2 whitespace-nowrap">
        {ok && <BadgeChip kind="live" />}
        <BadgeChip kind="simulated" />
        <span className="opacity-85">{text}</span>
      </span>
    </Hint>
  )
}

function RegionSwitch({ state }: { state: State }) {
  const change = useRegionSwitch()
  const r = state.region
  return (
    <Hint text={`${r.port}, ${r.country}. Units in ${r.weight_unit === 'kg' ? 'kilograms' : 'pounds'} and ${r.currency}. Customs is ${r.customs}. Rung decides the same way in every region.`}>
      <span>
        <Select value={r.id} onValueChange={(id) => change.mutate(id)} disabled={change.isPending}>
          <SelectTrigger aria-label="Region" className="h-8 border-current/30 font-semibold data-[size=default]:h-8 [&_svg]:text-current">
            <Globe className="size-4" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {state.regions.map((x) => (
              <SelectItem key={x.id} value={x.id} className="text-base">
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

function StatusStrip({ state }: { state: State }) {
  const latest = state.event_log[0]
  return (
    <div className="flex flex-col">
      {state.dark_feed.map((line) => (
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-current/10 px-4 py-1">
        <p className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          <Radio className="size-4 shrink-0" aria-hidden />
          <span className="shrink-0 opacity-75">Latest event</span>
          <span className="truncate font-semibold">{latest ? eventLine(latest) : 'Nothing has happened yet tonight'}</span>
        </p>
        <RegionSwitch state={state} />
        <DataChip state={state} />
      </div>
    </div>
  )
}

function Header({ state, route, panel, onPanel }: { state: State; route: Route; panel: Panel; onPanel: (p: Panel) => void }) {
  const { time, date } = clockParts(state.clock)
  const harbor = state.mode === 'harbor_night'
  const night = NIGHT_COPY[state.mode] ?? { name: state.mode, tagline: '' }
  const auditBox = route.name === 'box' ? route.number : ''
  return (
    <header className={`sticky top-0 z-20 shadow-md ${harbor ? 'border-b-4 border-red-600 bg-indigo-950 text-white' : 'border-b border-slate-200 bg-white text-slate-900'}`}>
      <div className="flex min-h-16 flex-wrap items-center gap-x-5 gap-y-1 px-4 py-1.5">
        <a href="#/" className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-tight">Rung</span>
          <span className="text-lg opacity-75">Gate triage at {state.terminal}</span>
        </a>
        <span className="flex items-center gap-2">
          <ModePill mode={state.mode} />
          <Hint text={night.tagline}>
            <span tabIndex={0} className="text-lg font-semibold opacity-85">
              {night.name}
            </span>
          </Hint>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">{time}</span>
          <Hint text={`Local time in ${state.region.name}, ${state.region.utc_offset}. The scenario is the same night shift at whichever port you pick.`}>
            <span tabIndex={0} className="opacity-75">
              {date} {state.region.tz_label}
            </span>
          </Hint>
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
      <StatusStrip state={state} />
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
  setRegion(state.data.region)
  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen pb-24">
        <Header state={state.data} route={route} panel={panel} onPanel={setPanel} />
        {state.isError && <p className="bg-red-100 px-4 py-2 text-red-900">Lost contact with the Rung server. Showing the last update.</p>}
        {route.name === 'box' && <BoxCard key={route.number} number={route.number} onAudit={(box) => setPanel({ kind: 'audit', box })} onPrompt={() => setPanel({ kind: 'prompt' })} />}
        {route.name === 'gate' && <GateScreen />}
        {route.name === 'queue' && <Queue state={state.data} />}
        <AuditPanel open={panel?.kind === 'audit'} key={panel?.kind === 'audit' ? panel.box : 'audit'} initialBox={panel?.kind === 'audit' ? panel.box : ''} onClose={closePanel} />
        <TwistPanel open={panel?.kind === 'twist'} onClose={closePanel} />
        <PromptPanel open={panel?.kind === 'prompt'} onClose={closePanel} />
        <DemoDock state={state.data} onTwist={() => setPanel({ kind: 'twist' })} onPrompt={() => setPanel({ kind: 'prompt' })} />
      </div>
    </TooltipProvider>
  )
}
