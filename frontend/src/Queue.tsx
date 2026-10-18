import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarClock, ChevronDown, Clock, Snowflake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STEPS, useQueue, type QueueRow, type State, type Step } from './api'
import { GROUP_ORDER, LADDER, STEP_META, issueTags, urgencyLevel } from './copy'
import { OverrideDialog, PlannerActions } from './Decide'
import { NightBrief } from './NightBrief'
import { LadderHelp, NeedsYou, SourceBadges, STEP_ICON, StepLabel, UrgencyHelp, UrgencyMeter } from './ui'

type Filter = Step | 'NEEDS' | ''
type View = 'simple' | 'detailed'

const PREVIEW_ROWS = 5
const VIEW_KEY = 'rung.queue.view'

const COLUMNS: Record<View, string[]> = {
  simple: ['w-[210px]', 'w-[220px]', '', 'w-[190px]', 'w-[120px]'],
  detailed: ['w-[190px]', 'w-[112px]', 'w-[200px]', '', 'w-[210px]', 'w-[180px]'],
}

export const needsYou = (row: Pick<QueueRow, 'hand' | 'planner'>) => row.hand && !row.planner

function useView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(() => (localStorage.getItem(VIEW_KEY) === 'detailed' ? 'detailed' : 'simple'))
  const change = (v: View) => {
    localStorage.setItem(VIEW_KEY, v)
    setView(v)
  }
  return [view, change]
}

export default function Queue({ state }: { state: State }) {
  const [carrier, setCarrier] = useState('')
  const [filter, setFilter] = useState<Filter>('')
  const [view, setView] = useView()
  const [expanded, setExpanded] = useState<Set<Step>>(new Set())
  const [overriding, setOverriding] = useState<QueueRow | null>(null)
  const queue = useQueue({ carrier, step: '' })
  const all = queue.data

  const counts = useMemo(() => {
    const c = Object.fromEntries(STEPS.map((s) => [s, 0])) as Record<Step, number>
    for (const row of all ?? []) c[row.step] += 1
    return c
  }, [all])
  const needs = useMemo(() => (all ?? []).filter(needsYou), [all])

  const groups = useMemo(() => {
    const rows = (all ?? []).filter((r) => (filter === 'NEEDS' ? needsYou(r) : filter ? r.step === filter : true))
    const byStep = new Map<Step, QueueRow[]>()
    for (const row of rows) {
      const list = byStep.get(row.step) ?? []
      list.push(row)
      byStep.set(row.step, list)
    }
    return GROUP_ORDER.filter((s) => byStep.has(s)).map((s) => ({ step: s, rows: byStep.get(s)! }))
  }, [all, filter])

  const toggle = (f: Filter) => setFilter((current) => (current === f ? '' : f))
  const queueRef = useRef<HTMLElement>(null)
  const showStep = (s: Step) => {
    setFilter(s)
    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const toggleGroup = (s: Step) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  const cols = COLUMNS[view]

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 pt-3 pb-6">
      <NightBrief state={state} onFilter={showStep} />

      <section ref={queueRef} aria-label="Gate queue" className="scroll-mt-40 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {!all
                ? 'Gate queue'
                : needs.length === 0
                  ? 'Nothing needs your decision right now'
                  : `${needs.length} ${needs.length === 1 ? 'box needs' : 'boxes need'} your decision`}
            </h2>
            <p className="text-lg text-slate-700">
              {all ? `${all.length} boxes waiting, most urgent first.` : 'Every box waiting, most urgent first.'}{' '}
              <LadderHelp
                trigger={
                  <button type="button" className="font-semibold text-sky-900 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-800">
                    How the ladder works
                  </button>
                }
              />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {needs.length > 0 && (
              <Button variant={filter === 'NEEDS' ? 'default' : 'outline'} aria-pressed={filter === 'NEEDS'} onClick={() => toggle('NEEDS')}>
                {filter === 'NEEDS' ? 'Show every box' : 'Show only these'}
              </Button>
            )}
            <ViewSwitch view={view} onChange={setView} />
            <label className="flex items-center gap-2">
              <span className="text-slate-700">Dray carrier</span>
              <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                <option value="">All carriers</option>
                {state.carriers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <LadderStrip counts={counts} filter={filter} onPick={toggle} />
      </section>

      {queue.isError && !all && <Notice tone="error">Cannot reach the queue. Retrying every 2 seconds.</Notice>}
      {queue.isPending && <Notice>Loading the queue</Notice>}
      {all && groups.length === 0 && (
        <Notice>
          {filter && filter !== 'NEEDS' ? `No box is on ${STEP_META[filter].word} right now.` : 'No boxes match these filters.'}{' '}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setFilter('')}>
            Show every box
          </button>
        </Notice>
      )}

      {groups.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className={`w-full ${view === 'simple' ? 'min-w-[960px]' : 'min-w-[1150px]'} table-fixed border-collapse text-left text-base`}>
            <colgroup>
              {cols.map((c, i) => (
                <col key={i} className={c} />
              ))}
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              {view === 'simple' ? (
                <tr>
                  <th className="px-3 py-2 font-semibold">Box</th>
                  <th className="px-3 py-2 font-semibold">Rung says</th>
                  <th className="px-3 py-2 font-semibold">Why</th>
                  <th className="px-3 py-2 font-semibold">Your move</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2 font-semibold">Box</th>
                  <th className="px-3 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      Urgency <UrgencyHelp />
                    </span>
                  </th>
                  <th className="px-3 py-2 font-semibold">Rung says</th>
                  <th className="px-3 py-2 font-semibold">Why</th>
                  <th className="px-3 py-2 font-semibold">Timing</th>
                  <th className="px-3 py-2 font-semibold">Your move</th>
                </tr>
              )}
            </thead>
            {groups.map((group) => {
              const open = filter !== '' || expanded.has(group.step) || group.rows.length <= PREVIEW_ROWS + 1
              const shown = open ? group.rows : group.rows.slice(0, PREVIEW_ROWS)
              return (
                <tbody key={group.step}>
                  <GroupHeader step={group.step} count={group.rows.length} span={cols.length} />
                  {shown.map((row) =>
                    view === 'simple' ? (
                      <SimpleRow key={row.number} row={row} onOverride={() => setOverriding(row)} />
                    ) : (
                      <Row key={row.number} row={row} onOverride={() => setOverriding(row)} />
                    ),
                  )}
                  {group.rows.length > PREVIEW_ROWS + 1 && filter === '' && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={cols.length} className="px-3 py-1.5">
                        <Button variant="ghost" size="sm" onClick={() => toggleGroup(group.step)}>
                          {open ? `Show fewer ${STEP_META[group.step].word} boxes` : `Show all ${group.rows.length} ${STEP_META[group.step].word} boxes`}
                        </Button>
                      </td>
                    </tr>
                  )}
                </tbody>
              )
            })}
          </table>
        </div>
      )}

      {overriding && <OverrideDialog target={overriding} onClose={() => setOverriding(null)} />}
    </main>
  )
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const options: [View, string, string][] = [
    ['simple', 'Simple', 'One line per box: the step, the reason in a few words, and your move. Open Details on any row for the rest.'],
    ['detailed', 'Detailed', 'Every row shows urgency, the booked slot, the last free day, reefer readings, and the full reason.'],
  ]
  return (
    <div className="flex items-center rounded-lg border border-slate-300 p-0.5" role="group" aria-label="Queue view">
      {options.map(([id, label, hint]) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          title={hint}
          onClick={() => onChange(id)}
          className={`h-8 rounded-md px-3 font-semibold ${view === id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function LadderStrip({ counts, filter, onPick }: { counts: Record<Step, number>; filter: Filter; onPick: (s: Step) => void }) {
  return (
    <div aria-label="The ladder" role="group" className="mt-3 grid grid-cols-[repeat(5,minmax(0,1fr))_auto_minmax(0,1fr)] items-stretch gap-2">
      {LADDER.flatMap((s) => {
        const Icon = STEP_ICON[s]
        const on = filter === s
        const divider = s === 'HAND' ? [<div key="divider" className="mx-1 w-px self-stretch bg-slate-200" aria-hidden />] : []
        return [
          ...divider,
          <button
            key={s}
            type="button"
            aria-pressed={on}
            title={`${STEP_META[s].meaning} Click to show only ${STEP_META[s].word} boxes.`}
            onClick={() => onPick(s)}
            className={`flex flex-col gap-0.5 rounded-lg border-2 border-t-[6px] px-3 py-1 text-left transition-colors ${STEP_META[s].rail} ${
              on ? `${STEP_META[s].soft} ring-2 ring-slate-900` : counts[s] === 0 ? 'bg-white opacity-60 hover:opacity-100' : 'bg-white hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`flex items-center gap-1.5 text-lg font-bold ${STEP_META[s].text}`}>
                <Icon className="size-5" aria-hidden />
                {STEP_META[s].word}
              </span>
              <span className="text-2xl font-bold tabular-nums">{counts[s]}</span>
            </span>
            <span className="leading-tight text-slate-700">{STEP_META[s].short}</span>
          </button>,
        ]
      })}
    </div>
  )
}

function GroupHeader({ step, count, span }: { step: Step; count: number; span: number }) {
  const meta = STEP_META[step]
  const Icon = STEP_ICON[step]
  return (
    <tr className={`border-t border-slate-200 ${meta.soft.split(' ')[0]}`}>
      <td colSpan={span} className={`border-l-[6px] px-3 py-2 ${meta.rail}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`flex items-center gap-1.5 text-lg font-bold ${meta.text}`}>
            <Icon className="size-5" aria-hidden />
            {meta.word}
          </span>
          <span className="text-lg font-semibold">{count === 1 ? '1 box' : `${count} boxes`}</span>
          <span className="text-slate-700">{meta.meaning}</span>
          <span className="ml-auto font-semibold text-slate-700">{meta.who}</span>
        </div>
      </td>
    </tr>
  )
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p className={`rounded-xl border px-4 py-6 text-center text-lg ${tone === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-200 bg-white text-slate-700'}`}>
      {children}
    </p>
  )
}

export const plainLfd = (label: string) => label.replace(/^LFD /, 'Last free day ')

function BoxNumber({ number }: { number: string }) {
  return (
    <a href={`#/box/${number}`} className="font-mono text-lg font-semibold text-sky-900 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-800">
      {number}
    </a>
  )
}

const equipment = (row: QueueRow) => `${row.equipment_type}${row.equipment_length ? ` ${row.equipment_length} ft` : ''}`

function Tags({ row }: { row: QueueRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {issueTags(row.fired, row.owner, row.step).map((t) => (
        <span key={t} className="rounded-md bg-slate-100 px-2 font-semibold text-slate-800">
          {t}
        </span>
      ))}
    </div>
  )
}

function Flags({ row }: { row: QueueRow }) {
  return (
    <>
      {row.owner && <span className="text-slate-700">Owner: {row.owner}</span>}
      {row.rated && <span className="rounded bg-amber-300 px-1.5 font-semibold text-indigo-950">Rated order</span>}
      {row.pinned && row.step === 'RELEASE' && <span className="font-semibold text-emerald-800">Pinned to the top</span>}
    </>
  )
}

function Timing({ row }: { row: QueueRow }) {
  const { lfd, reefer, appointment } = row.clocks
  return (
    <ul className="flex flex-col gap-0.5">
      {row.rated && <li className="font-semibold text-amber-800">{row.rated.label}</li>}
      <ClockLine icon={<CalendarClock aria-hidden />} tone={appointment?.lane_closed ? 'font-semibold text-amber-800' : ''}>
        {appointment ? `Slot ${appointment.label.replace(/^Lane (\d+) at (\d\d:\d\d)/, '$2 lane $1')}` : 'No appointment'}
      </ClockLine>
      {lfd && (
        <ClockLine icon={<Clock aria-hidden />} tone={lfd.hours <= 24 ? 'font-semibold text-red-800' : ''}>
          {plainLfd(lfd.label)}
        </ClockLine>
      )}
      {reefer && (
        <ClockLine icon={<Snowflake aria-hidden />} tone={reefer.power_on && !reefer.silent ? '' : 'font-semibold text-red-800'}>
          {reefer.label}
        </ClockLine>
      )}
    </ul>
  )
}

function SimpleRow({ row, onOverride }: { row: QueueRow; onOverride: () => void }) {
  const [open, setOpen] = useState(false)
  const level = urgencyLevel(row.urgency)
  return (
    <Fragment>
      <tr className={`border-t border-slate-100 align-top ${open ? 'bg-slate-50' : 'hover:bg-slate-50/70'}`}>
        <td className="px-3 py-2.5">
          <BoxNumber number={row.number} />
          <div className="text-slate-700">{equipment(row)}</div>
          <div className={`font-semibold ${level.text}`}>{level.label} urgency</div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-col items-start gap-1">
            <StepLabel step={row.step} />
            {needsYou(row) && <NeedsYou />}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <Tags row={row} />
        </td>
        <td className="px-3 py-2.5">
          <PlannerActions target={row} onOverride={onOverride} />
        </td>
        <td className="px-2 py-2.5 text-right">
          <Button variant="ghost" size="sm" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details for ${row.number}`} onClick={() => setOpen(!open)}>
            Details
            <ChevronDown className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={5} className="px-3 pt-1 pb-3">
            <div className="grid gap-x-6 gap-y-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[150px_230px_250px_minmax(0,1fr)]">
              <Detail label={<span className="inline-flex items-center gap-1">Urgency <UrgencyHelp /></span>}>
                <UrgencyMeter value={row.urgency} />
              </Detail>
              <Detail label="Booking">
                <div className="flex flex-col items-start gap-1">
                  {row.dray_carrier && <span>{row.dray_carrier}</span>}
                  <Flags row={row} />
                  <SourceBadges badges={row.badges} />
                </div>
              </Detail>
              <Detail label="Timing">
                <Timing row={row} />
              </Detail>
              <Detail label="Reason">
                <p className="text-slate-800">{row.reason}</p>
              </Detail>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function Detail({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-semibold text-slate-600">{label}</span>
      {children}
    </div>
  )
}

function Row({ row, onOverride }: { row: QueueRow; onOverride: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <tr className="border-t border-slate-100 align-top hover:bg-slate-50/70">
      <td className="px-3 py-2.5">
        <BoxNumber number={row.number} />
        <div className="text-slate-700">{equipment(row)}</div>
        {row.dray_carrier && <div className="truncate text-slate-600">{row.dray_carrier}</div>}
        <div className="mt-1">
          <SourceBadges badges={row.badges} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <UrgencyMeter value={row.urgency} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col items-start gap-1">
          <StepLabel step={row.step} />
          {needsYou(row) && <NeedsYou />}
          <Flags row={row} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <Tags row={row} />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`mt-1 text-left text-slate-600 ${open ? '' : 'line-clamp-2'}`}
          title={open ? 'Show less' : 'Show the full reason'}
        >
          {row.reason}
        </button>
      </td>
      <td className="px-3 py-2.5">
        <Timing row={row} />
      </td>
      <td className="px-3 py-2.5">
        <PlannerActions target={row} onOverride={onOverride} />
      </td>
    </tr>
  )
}

function ClockLine({ icon, tone = '', children }: { icon: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <li className={`flex items-start gap-1.5 leading-snug ${tone} [&_svg]:mt-1 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-slate-500`}>
      {icon}
      <span>{children}</span>
    </li>
  )
}
