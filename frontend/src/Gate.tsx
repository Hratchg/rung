import { useMemo, type ReactNode } from 'react'
import { ArrowRightLeft, CalendarClock, Flag, Snowflake, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppState, useGate, useLaneToggle, type Emissions, type Gate, type GateChip, type GateIdle, type RatedRowStatus } from './api'
import { emissionsNote } from './copy'
import { laneList, sayHours, sayKg, sayNum, sayTime } from './format'
import { Notice } from './Queue'
import { InfoHint, StepChip } from './ui'

const TAGS: { key: 'reefer' | 'lfd_today' | 'moved' | 'rated'; icon: LucideIcon; label: string; className: string }[] = [
  { key: 'reefer', icon: Snowflake, label: 'Reefer', className: 'bg-sky-700 text-white' },
  { key: 'lfd_today', icon: CalendarClock, label: 'Last free day today or past', className: 'bg-amber-400 text-amber-950' },
  { key: 'moved', icon: ArrowRightLeft, label: 'Moved by Rung', className: 'bg-violet-700 text-white' },
  { key: 'rated', icon: Flag, label: 'Rated order with a deadline', className: 'bg-indigo-950 text-amber-300' },
]

type Tagged = Pick<GateChip, 'reefer' | 'lfd_today'> & { moved?: boolean; rated?: boolean }

const RATED_STATUS: Record<RatedRowStatus, { label: string; className: string }> = {
  on_time: { label: 'On time', className: 'bg-emerald-100 text-emerald-900' },
  released: { label: 'Released', className: 'bg-emerald-100 text-emerald-900' },
  late: { label: 'Late', className: 'bg-red-100 text-red-900' },
  overflow: { label: 'No slot', className: 'bg-red-100 text-red-900' },
  held: { label: 'On HOLD', className: 'bg-red-100 text-red-900' },
  missed: { label: 'Missed', className: 'bg-slate-200 text-slate-900' },
  no_appointment: { label: 'No booking', className: 'bg-slate-200 text-slate-900' },
}

function Tags({ chip }: { chip: Tagged }) {
  const on = TAGS.filter((t) => chip[t.key])
  if (on.length === 0) return null
  return (
    <span className="flex gap-0.5">
      {on.map((t) => (
        <span key={t.key} title={t.label} aria-label={t.label} className={`inline-flex size-6 items-center justify-center rounded ${t.className}`}>
          <t.icon className="size-4" aria-hidden />
        </span>
      ))}
    </span>
  )
}

function BoxLink({ box }: { box: string }) {
  return (
    <a href={`#/box/${box}`} className="font-mono font-semibold text-sky-900 underline decoration-sky-900/30 underline-offset-2 hover:decoration-sky-900">
      {box}
    </a>
  )
}

function SolverLine({ gate }: { gate: Gate }) {
  const fallback = gate.solver !== 'linear_sum_assignment'
  return (
    <span title={gate.error ?? undefined} className={fallback ? 'font-semibold text-amber-900' : 'text-slate-600'}>
      {fallback ? 'Solver failed, so Rung used a greedy urgency sort' : 'Solved as an assignment problem with scipy linear_sum_assignment'} in {gate.solve_ms.toFixed(2)} ms.
    </span>
  )
}

function idleText(t: GateIdle): string {
  return t.idle_minutes > 0 ? ` Idles ${sayHours(t.idle_minutes / 60)} at the gate, ${sayKg(t.co2_kg)} kg CO2.` : ''
}

function EmissionsFootnote({ emissions }: { emissions: Emissions | undefined }) {
  if (!emissions) return null
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-slate-600">
      <span>Idle CO2 is modelled, not measured, at {sayNum(emissions.kg_co2_per_idle_hour, 2)} kg per truck idle hour. Sources:</span>
      {emissions.sources.map((src, i) => (
        <span key={src.url}>
          <a href={src.url} target="_blank" rel="noreferrer" title={src.label} className="underline decoration-slate-400 underline-offset-2 hover:text-slate-900">
            {src.label.split(',')[0]}
          </a>
          {i < emissions.sources.length - 1 ? ',' : ''}
        </span>
      ))}
      <InfoHint label="How the CO2 factor is built" text={emissionsNote(emissions)} />
    </p>
  )
}

function Hero({ gate }: { gate: Gate }) {
  const emissions = useAppState().data?.emissions
  const { rung, blunt, appointments, reefers_total, lfd_total, idle_hours_avoided, idle_co2_kg_avoided } = gate.compare
  const closed = gate.lanes.filter((l) => !l.open).map((l) => l.id)
  const big: [string, number, number, number][] = [
    ['Trucks kept on the gate plan', rung.kept, 0, appointments],
    ['Reefers kept', rung.reefers_kept, blunt.reefers_kept, reefers_total],
    ['Last free day boxes kept', rung.lfd_kept, blunt.lfd_kept, lfd_total],
  ]
  const small: [string, string, string][] = [
    ['Bookings kept', `${rung.throughput_pct}%`, `${blunt.throughput_pct}%`],
    ['Released so far', String(rung.released), String(blunt.released)],
    ['Reefers lost', String(rung.reefers_lost), String(blunt.reefers_lost)],
  ]
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Rung against closing the terminal">
      <h2 className="text-2xl font-bold tracking-tight">
        {closed.length > 0
          ? `Lanes ${laneList(closed)} are closed. Rung keeps ${rung.kept} of ${appointments} trucks moving and saves ${sayNum(idle_hours_avoided, 0)} idle hours and ${sayKg(idle_co2_kg_avoided)} kg of CO2.`
          : `All ${gate.lanes.length} lanes are open. Rung keeps ${rung.kept} of ${appointments} trucks on the plan.`}
      </h2>
      <p className="text-lg text-slate-700">
        {closed.length > 0
          ? 'The blunt move on a bad night is to close the terminal. Then nothing leaves and every truck in line waits.'
          : 'When lanes close, Rung moves every booked truck to the best open slot, reefers and last free day boxes first.'}{' '}
        <SolverLine gate={gate} />
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        {big.map(([label, a, b, total]) => (
          <div key={label} className="rounded-lg border border-slate-200 px-4 py-3">
            <p className="text-slate-700">{label}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-semibold text-emerald-800">Rung</span>
              <span className="text-3xl font-bold tabular-nums">{a}</span>
              <span className="text-lg text-slate-600">of {total}</span>
            </p>
            <p className="flex items-baseline gap-2">
              <span className="font-semibold text-red-800">Closed terminal</span>
              <span className="text-lg font-semibold tabular-nums">{b}</span>
              <span className="text-slate-600">of {total}</span>
            </p>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-slate-700">Truck idle at the gate tonight</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-semibold text-emerald-800">Rung</span>
            <span className="text-3xl font-bold tabular-nums">{sayKg(rung.idle_co2_kg_plan)}</span>
            <span className="text-lg text-slate-600">kg CO2, {sayNum(rung.idle_hours_plan, 0)} h</span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="font-semibold text-red-800">Closed terminal</span>
            <span className="text-lg font-semibold tabular-nums">{sayKg(blunt.idle_co2_kg_plan)}</span>
            <span className="text-slate-600">kg, {sayNum(blunt.idle_hours_plan, 0)} h</span>
          </p>
        </div>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1">
        {small.map(([label, a, b]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dt className="text-slate-700">{label}</dt>
            <dd className="font-semibold">
              <span className="text-emerald-800">Rung</span> <span className="tabular-nums">{a}</span>
              <span className="mx-2 text-slate-400">|</span>
              <span className="text-red-800">Closed</span> <span className="tabular-nums">{b}</span>
            </dd>
          </div>
        ))}
      </dl>
      <EmissionsFootnote emissions={emissions} />
    </section>
  )
}

function Grid({ gate }: { gate: Gate }) {
  const toggle = useLaneToggle()
  const cells = useMemo(() => {
    const map = new Map<string, (GateChip & { moved: boolean })[]>()
    for (const chip of Object.values(gate.placed)) {
      const key = `${chip.lane} ${chip.window}`
      const list = map.get(key) ?? []
      list.push(chip)
      map.set(key, list)
    }
    for (const list of map.values()) list.sort((a, b) => b.urgency - a.urgency || a.box.localeCompare(b.box))
    return map
  }, [gate.placed])
  const leftClosed = useMemo(() => {
    const map = new Map<string, number>()
    const closed = new Set(gate.lanes.filter((l) => !l.open).map((l) => l.id))
    const away = [...gate.moved.map((m) => ({ lane: m.old_lane, window: m.old_window })), ...gate.overflow]
    for (const b of away) {
      if (!closed.has(b.lane)) continue
      const key = `${b.lane} ${b.window}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [gate.lanes, gate.moved, gate.overflow])

  return (
    <section aria-label="Lanes by window" className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] table-fixed border-collapse text-base">
        <colgroup>
          <col className="w-[112px]" />
          {gate.windows.map((w) => (
            <col key={w} />
          ))}
        </colgroup>
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
          <tr>
            <th className="px-2 py-2 text-left font-semibold">Lane</th>
            {gate.windows.map((w) => (
              <th key={w} className="px-2 py-2 text-left font-semibold tabular-nums">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gate.lanes.map((lane) => (
            <tr key={lane.id} className={`border-t border-slate-200 align-top ${lane.open ? '' : 'bg-[repeating-linear-gradient(135deg,#f1f5f9_0,#f1f5f9_10px,#e2e8f0_10px,#e2e8f0_20px)]'}`}>
              <th scope="row" className="px-2 py-2 text-left">
                <div className="text-lg font-bold">Lane {lane.id}</div>
                <div className={`font-semibold ${lane.open ? 'text-emerald-800' : 'text-red-800'}`}>{lane.open ? 'Open' : 'Closed'}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ lane: lane.id, open: !lane.open })}
                  aria-label={`${lane.open ? 'Close' : 'Open'} lane ${lane.id}`}
                >
                  {lane.open ? 'Close' : 'Open'}
                </Button>
              </th>
              {gate.windows.map((w) => {
                const key = `${lane.id} ${w}`
                const chips = cells.get(key) ?? []
                const away = leftClosed.get(key) ?? 0
                return (
                  <td key={w} className="border-l border-slate-200 px-1 py-1.5">
                    {lane.open ? (
                      <ul className="flex flex-col gap-1">
                        {chips.map((c) => (
                          <li
                            key={c.box}
                            className={`flex flex-wrap items-center gap-x-1 rounded border px-1 py-0.5 ${
                              c.moved ? 'border-violet-400 bg-violet-50' : 'border-slate-300 bg-white'
                            }`}
                            title={`${c.box}. Urgency ${c.urgency}. ${c.step}.`}
                          >
                            <a href={`#/box/${c.box}`} className="font-mono text-base tracking-tight hover:underline">
                              {c.box}
                            </a>
                            <Tags chip={c} />
                          </li>
                        ))}
                        {chips.length < gate.capacity && (
                          <li className="px-1.5 text-slate-500">{gate.capacity - chips.length} free</li>
                        )}
                      </ul>
                    ) : (
                      <span className="text-slate-600">{away > 0 ? `Closed. ${away} trucks moved out` : 'Closed'}</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function ListSection({ title, count, children, empty }: { title: string; count: number; children: ReactNode; empty: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={title}>
      <h3 className="border-b border-slate-200 px-4 py-2 text-lg font-bold">
        {title} <span className="font-semibold text-slate-600">{count}</span>
      </h3>
      {count === 0 ? <p className="px-4 py-3 text-slate-700">{empty}</p> : <div className="max-h-[420px] overflow-y-auto">{children}</div>}
    </section>
  )
}

function Moved({ gate }: { gate: Gate }) {
  return (
    <ListSection title="Moved to a new slot" count={gate.moved.length} empty="Nobody moved. Every booking keeps its lane and window.">
      <ul className="divide-y divide-slate-100">
        {gate.moved.map((m) => (
          <li key={m.box} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <BoxLink box={m.box} />
              <Tags chip={m} />
              <span className="tabular-nums text-slate-700">Urgency {m.urgency}</span>
              <span className="ml-auto font-semibold tabular-nums">{m.delay_hours > 0 ? `${sayHours(m.delay_hours)} later` : 'Same window'}</span>
            </div>
            <p className="text-slate-800">
              {m.reason}
              {idleText(m)}
            </p>
          </li>
        ))}
      </ul>
    </ListSection>
  )
}

function Overflow({ gate }: { gate: Gate }) {
  const rows = useMemo(() => [...gate.overflow].sort((a, b) => Number(b.slid) - Number(a.slid)), [gate.overflow])
  return (
    <ListSection title="No slot tonight" count={gate.overflow.length} empty="Every box not on Hold has a slot tonight.">
      {gate.rated.slid > 0 && (
        <p className="border-b border-slate-200 bg-red-50 px-4 py-2 font-semibold text-red-900">
          {gate.rated.slid} boxes lost their slot when rated orders took it. They are listed first.
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {rows.map((o) => (
          <li key={o.box} className="px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <BoxLink box={o.box} />
              <Tags chip={o} />
              <StepChip step={o.step} />
              {o.slid && <span className="rounded bg-red-700 px-1.5 font-semibold text-white">Lost its slot to a rated order</span>}
              <span className="ml-auto tabular-nums text-slate-700">Urgency {o.urgency}</span>
            </div>
            <p className="text-slate-800">
              Booked {o.window} lane {o.lane}. {o.reason}
              {idleText(o)}
            </p>
          </li>
        ))}
      </ul>
    </ListSection>
  )
}

function RatedStrip({ gate }: { gate: Gate }) {
  const r = gate.rated
  if (!r.on) return null
  const onTime = r.rows.filter((x) => x.status === 'on_time' || x.status === 'released').length
  return (
    <section className="rounded-lg border-2 border-indigo-950 bg-amber-50 px-4 py-3" aria-label="Rated orders">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold">Rated orders</h3>
        <span>
          Gate out by {sayTime(r.deadline)}, so the last window is {r.latest_window ?? 'already past'}. {onTime} of {r.rows.length} on time.{' '}
          {r.slid > 0 ? `${r.slid} other boxes lost their slot.` : 'No other box lost its slot.'}
        </span>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {r.rows.map((row) => (
          <li key={row.box} className="rounded-md border border-slate-300 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <BoxLink box={row.box} />
              <span className={`rounded px-1.5 font-semibold ${RATED_STATUS[row.status].className}`}>{RATED_STATUS[row.status].label}</span>
              <span className="ml-auto tabular-nums text-slate-700">Urgency {row.urgency}</span>
            </div>
            <p className="text-slate-800">{row.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Held({ gate }: { gate: Gate }) {
  if (gate.held.length === 0 && gate.missed.length === 0) return null
  return (
    <section className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base" aria-label="Not planned">
      {gate.held.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">
            {gate.held.length} boxes on Hold take no slot until their owner clears the hold
          </summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {gate.held.map((h) => (
              <li key={h.box} className="flex flex-wrap items-center gap-2 py-1">
                <BoxLink box={h.box} />
                <Tags chip={h} />
                <span className="text-slate-800">{h.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {gate.missed.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold">
            {gate.missed.length} boxes missed a window that has ended ({gate.ended_windows.join(', ')})
          </summary>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {gate.missed.map((b) => (
              <BoxLink key={b} box={b} />
            ))}
          </p>
        </details>
      )}
    </section>
  )
}

export default function GateScreen() {
  const gate = useGate()
  const toggle = useLaneToggle()
  const g = gate.data

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 pt-4 pb-6">
      {gate.isError && !g && <Notice tone="error">Cannot reach the gate plan. Retrying every 2 seconds.</Notice>}
      {gate.isPending && <Notice>Solving the gate plan</Notice>}
      {toggle.error && <Notice tone="error">{toggle.error.message}</Notice>}
      {g?.error && <Notice tone="error">The solver failed, so Rung used the greedy urgency sort. {g.error}</Notice>}
      {g && g.windows.length === 0 && <Notice>Every window tonight has ended. Nothing left to plan.</Notice>}

      {g && g.windows.length > 0 && (
        <>
          <Hero gate={g} />
          <RatedStrip gate={g} />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <h3 className="text-lg font-bold">Gate plan by lane and hour</h3>
            <span className="text-slate-700">
              {Object.keys(g.placed).length} trucks in {g.units} slots. {g.capacity} trucks per lane per hour. Close or open a lane to watch Rung plan again.
            </span>
            <span className="flex flex-wrap items-center gap-3 text-slate-700 sm:ml-auto">
              {TAGS.map((t) => (
                <span key={t.key} className="flex items-center gap-1">
                  <span className={`inline-flex size-6 items-center justify-center rounded ${t.className}`}>
                    <t.icon className="size-4" aria-hidden />
                  </span>
                  {t.label}
                </span>
              ))}
            </span>
          </div>
          <Grid gate={g} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Moved gate={g} />
            <Overflow gate={g} />
          </div>
          <Held gate={g} />
        </>
      )}
    </main>
  )
}
