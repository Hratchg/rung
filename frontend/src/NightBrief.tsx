import { useState, type ReactNode } from 'react'
import { ChevronDown, CircleCheck, Flag, ShieldAlert, ShieldCheck, SignalZero, Siren, TrafficCone, TriangleAlert, WifiOff, ZapOff, type LucideIcon } from 'lucide-react'
import { SOURCE_NAMES, useGate, useQueue, type Gate, type State, type Step } from './api'
import { NIGHT_COPY, emissionsNote } from './copy'
import { sayKg, sayNum } from './format'
import { MODE_COPY, incidents, nightMode, plural, type Incident, type IncidentKind } from './mode'
import { sayMoney } from './region'
import { Hint } from './ui'

const INCIDENT_ICON: Record<IncidentKind, LucideIcon> = {
  lanes: TrafficCone,
  feed: WifiOff,
  hold: ShieldAlert,
  reefer: ZapOff,
  silent: SignalZero,
  rated: Flag,
}

export function ModePill({ mode }: { mode: string }) {
  const m = nightMode(mode)
  const crisis = m === 'crisis'
  const Icon = crisis ? Siren : ShieldCheck
  return (
    <Hint text={MODE_COPY[m].hint}>
      <span
        tabIndex={0}
        data-demo="mode-pill"
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-lg font-bold whitespace-nowrap ${crisis ? 'bg-red-600 text-white' : 'bg-sky-100 text-sky-900'}`}
      >
        <Icon className="size-5" aria-hidden />
        {MODE_COPY[m].label}
      </span>
    </Hint>
  )
}

type StatDef = { key: string; label: string; value: string; hint: string; tone?: string; note?: string }

function tonightStats(state: State): StatDef[] {
  const c = state.counters
  return [
    { key: 'released', label: 'Released', value: String(c.released), hint: 'Trucks that have left the gate since the shift started.' },
    { key: 'powered', label: 'Reefers powered', value: String(c.reefers_powered), hint: 'Refrigerated boxes with power on, or already gone on a truck.' },
    {
      key: 'lost',
      label: 'Reefers lost',
      value: String(c.reefers_lost),
      tone: c.reefers_lost > 0 ? 'text-red-700' : '',
      hint: 'Reefers whose cargo has warmed past its loss limit.',
    },
    {
      key: 'fees',
      label: 'Fees avoided',
      value: sayMoney(c.demurrage_avoided_usd),
      hint: 'Demurrage, the daily storage fee a box owes once its free days run out, saved by releasing boxes in time.',
    },
    { key: 'bookings', label: 'Bookings kept', value: `${c.throughput_pct}%`, hint: 'Share of the bookings for tonight that still have a gate slot.' },
    {
      key: 'idle',
      label: 'Truck idle',
      note: 'modelled',
      value: `${sayNum(c.idle_hours)} h, ${sayKg(c.idle_co2_kg)} kg CO2`,
      hint: `Hours booked trucks have idled at the gate so far tonight, and the CO2 that idling burned. Closing the terminal would be ${sayNum(state.counters_blunt.idle_hours)} h and ${sayKg(state.counters_blunt.idle_co2_kg)} kg by now. ${emissionsNote(state.emissions)}`,
    },
  ]
}

const KEY_STATS: Record<'everyday' | 'crisis', string[]> = {
  everyday: ['released', 'fees', 'idle'],
  crisis: ['bookings', 'lost', 'idle'],
}

function Stat({ s }: { s: StatDef }) {
  return (
    <Hint text={s.hint}>
      <span tabIndex={0} className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-slate-600">{s.label}</span>
        <span className={`text-lg font-bold tabular-nums ${s.tone ?? ''}`}>{s.value}</span>
        {s.note && <span className="text-slate-500">{s.note}</span>}
      </span>
    </Hint>
  )
}

/** Three numbers that matter in this mode, with the other three one click away. */
function Tonight({ state, stack = false }: { state: State; stack?: boolean }) {
  const [all, setAll] = useState(false)
  const stats = tonightStats(state)
  const keys = KEY_STATS[nightMode(state.mode)]
  const shown = all ? stats : stats.filter((s) => keys.includes(s.key))
  const toggle = (
    <button type="button" aria-expanded={all} onClick={() => setAll(!all)} className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-950">
      {all ? 'Fewer numbers' : 'All numbers'}
      <ChevronDown className={`size-4 transition-transform duration-150 ${all ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  )
  return (
    <div className={stack ? 'flex flex-col items-start gap-0.5' : 'flex flex-wrap items-center gap-x-5 gap-y-1'} aria-label="Tonight so far">
      <div className="flex items-center gap-4">
        <span className="font-semibold text-slate-700">Tonight so far</span>
        {stack && toggle}
      </div>
      {shown.map((s) => (
        <Stat key={s.key} s={s} />
      ))}
      {!stack && toggle}
    </div>
  )
}

function IncidentAction({ incident, onFilter, className }: { incident: Incident; onFilter: (s: Step) => void; className: string }) {
  const a = incident.action
  if (!a) return null
  if (a.href) {
    return (
      <a href={a.href} className={className}>
        {a.label}
      </a>
    )
  }
  return (
    <button type="button" className={className} onClick={() => a.filter && onFilter(a.filter)}>
      {a.label}
    </button>
  )
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-slate-800' : 'font-semibold text-amber-900'}`}>
      {ok ? <CircleCheck className="size-5 text-emerald-700" aria-hidden /> : <TriangleAlert className="size-5 text-amber-600" aria-hidden />}
      {children}
    </li>
  )
}

function EverydayBar({ state, list, onFilter }: { state: State; list: Incident[]; onFilter: (s: Step) => void }) {
  const night = NIGHT_COPY[state.mode] ?? { name: state.mode, tagline: '' }
  const dark = state.dark_sources.length
  return (
    <section
      aria-label="Everyday mode"
      data-demo="everyday-bar"
      className="flex flex-wrap items-start gap-x-6 gap-y-2 rounded-xl border border-l-8 border-slate-200 border-l-sky-500 bg-white px-4 py-2.5 shadow-sm"
    >
      <div className="min-w-0 flex-1 basis-[34rem]">
        <div className="flex min-w-0 items-center gap-2.5">
          <ShieldCheck className="size-7 shrink-0 text-sky-700" aria-hidden />
          <p className="min-w-0">
            <span className="text-lg font-bold">{MODE_COPY.everyday.label}</span>{' '}
            <span className="font-semibold text-slate-600">{night.name}.</span> <span className="text-slate-700">{MODE_COPY.everyday.line}</span>
          </p>
        </div>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1" aria-label="Checks">
          <Check ok={state.lanes_open.length === state.lanes}>{`${state.lanes_open.length} of ${state.lanes} lanes open`}</Check>
          <Check ok={dark === 0}>{`${SOURCE_NAMES.length - dark} of ${SOURCE_NAMES.length} feeds reporting`}</Check>
          <Check ok={list.length === 0}>{list.length === 0 ? 'Nothing unusual' : `${plural(list.length, 'issue')} to watch`}</Check>
        </ul>
        {list.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2" aria-label="Issues to watch">
            {list.map((i) => {
              const Icon = INCIDENT_ICON[i.kind]
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Icon className="size-5 shrink-0 text-amber-600" aria-hidden />
                  <span className="font-semibold">{i.title}.</span>
                  <span className="text-slate-700">{i.detail}</span>
                  <IncidentAction incident={i} onFilter={onFilter} className="font-semibold text-sky-900 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-800" />
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="lg:border-l lg:border-slate-200 lg:pl-6">
        <Tonight state={state} stack />
      </div>
    </section>
  )
}

function Score({ gate }: { gate: Gate }) {
  const { rung, blunt, appointments, idle_hours_avoided, idle_co2_kg_avoided } = gate.compare
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
      <span>
        Rung keeps <strong className="text-2xl tabular-nums">{rung.kept}</strong> of {appointments} trucks moving. Closing the terminal keeps{' '}
        <strong className="tabular-nums">{blunt.kept}</strong>.
      </span>
      <span>
        Saves <strong className="tabular-nums">{sayNum(idle_hours_avoided, 0)}</strong> idle hours and <strong className="tabular-nums">{sayKg(idle_co2_kg_avoided)}</strong> kg CO2,
        modelled.
      </span>
    </p>
  )
}

const OPEN_KEY = 'rung.crisis.open'

function useOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== 'no')
  const toggle = () => {
    localStorage.setItem(OPEN_KEY, open ? 'no' : 'yes')
    setOpen(!open)
  }
  return [open, toggle]
}

function CrisisBoard({ state, list, gate, onFilter }: { state: State; list: Incident[]; gate: Gate | undefined; onFilter: (s: Step) => void }) {
  const night = NIGHT_COPY[state.mode] ?? { name: state.mode, tagline: '' }
  const [open, toggle] = useOpen()
  return (
    <section aria-label="Crisis mode" data-demo="crisis-board" className="overflow-hidden rounded-xl border-2 border-red-600 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-red-600 px-4 py-2 text-white">
        <span className="flex items-center gap-2 text-xl font-bold">
          <Siren className="size-6" aria-hidden />
          {MODE_COPY.crisis.label}
        </span>
        <span className="text-lg font-semibold">{night.name}</span>
        <div className="min-w-0 flex-1 basis-72 text-lg">{gate ? <Score gate={gate} /> : MODE_COPY.crisis.line}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="crisis-detail"
          onClick={toggle}
          className="flex items-center gap-1 rounded-md px-2 py-1 font-semibold whitespace-nowrap hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {open ? 'Hide' : `Show ${plural(list.length, 'problem')}`}
          <ChevronDown className={`size-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      <div id="crisis-detail" hidden={!open} className="flex flex-col gap-2 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            What went wrong tonight
            <span className="rounded bg-red-700 px-2 text-base text-white">{list.length}</span>
          </h3>
          <div className="ml-auto">
            <Tonight state={state} />
          </div>
        </div>
        {list.length === 0 ? (
          <p className="text-slate-700">Nothing has gone wrong yet. Rung is watching every lane and feed.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2" aria-label="Incidents">
            {list.map((i) => {
              const Icon = INCIDENT_ICON[i.kind]
              return (
                <li key={i.id} data-demo={`incident-${i.id}`} className="flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <Icon className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden />
                  <div className="min-w-0 leading-snug">
                    <p className="font-bold text-red-950">{i.title}</p>
                    <p className="text-slate-800">
                      {i.detail}{' '}
                      <IncidentAction incident={i} onFilter={onFilter} className="font-semibold whitespace-nowrap text-red-900 underline decoration-red-300 underline-offset-4 hover:decoration-red-800" />
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/** The top of the queue: which mode the night is in, what is unusual, and the numbers that matter. */
export function NightBrief({ state, onFilter }: { state: State; onFilter: (s: Step) => void }) {
  const queue = useQueue({ carrier: '', step: '' })
  const gate = useGate()
  const rows = queue.data
  const list = incidents(state, {
    moved: gate.data?.moved.length,
    overflow: gate.data?.overflow.length,
    feedBoxes: rows?.filter((r) => r.fired.includes('R10')).length,
    feedHand: rows?.filter((r) => r.fired.includes('R10') && r.step === 'HAND').length,
  })
  return nightMode(state.mode) === 'crisis' ? (
    <CrisisBoard state={state} list={list} gate={gate.data} onFilter={onFilter} />
  ) : (
    <EverydayBar state={state} list={list} onFilter={onFilter} />
  )
}
