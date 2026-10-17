import { useMemo, useState, type ReactNode } from 'react'
import { CalendarClock, Clock, Snowflake } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STEPS, useQueue, type QueueRow, type Step } from './api'
import { GROUP_ORDER, LADDER, STEP_META, issueTags } from './copy'
import { OverrideDialog, PlannerActions } from './Decide'
import { LadderHelp, NeedsYou, SourceBadges, STEP_ICON, StepLabel, UrgencyHelp, UrgencyMeter } from './ui'

type Filter = Step | 'NEEDS' | ''

const PREVIEW_ROWS = 5

export const needsYou = (row: Pick<QueueRow, 'hand' | 'planner'>) => row.hand && !row.planner

export default function Queue({ carriers }: { carriers: string[] }) {
  const [carrier, setCarrier] = useState('')
  const [filter, setFilter] = useState<Filter>('')
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
  const toggleGroup = (s: Step) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 pt-4 pb-6">
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
            {all ? `${all.length} boxes waiting to leave the gate. Most urgent first.` : 'Every box waiting to leave the gate, most urgent first.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {needs.length > 0 && (
            <Button variant={filter === 'NEEDS' ? 'default' : 'outline'} aria-pressed={filter === 'NEEDS'} onClick={() => toggle('NEEDS')}>
              {filter === 'NEEDS' ? 'Show every box' : 'Show only these'}
            </Button>
          )}
          <label className="flex items-center gap-2">
            <span className="text-slate-700">Dray carrier</span>
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              <option value="">All carriers</option>
              {carriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <LadderStrip counts={counts} filter={filter} onPick={toggle} />

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
          <table className="w-full min-w-[1150px] table-fixed border-collapse text-left text-base">
            <colgroup>
              <col className="w-[190px]" />
              <col className="w-[112px]" />
              <col className="w-[200px]" />
              <col />
              <col className="w-[210px]" />
              <col className="w-[180px]" />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
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
            </thead>
            {groups.map((group) => {
              const open = filter !== '' || expanded.has(group.step) || group.rows.length <= PREVIEW_ROWS + 1
              const shown = open ? group.rows : group.rows.slice(0, PREVIEW_ROWS)
              return (
                <tbody key={group.step}>
                  <GroupHeader step={group.step} count={group.rows.length} />
                  {shown.map((row) => (
                    <Row key={row.number} row={row} onOverride={() => setOverriding(row)} />
                  ))}
                  {group.rows.length > PREVIEW_ROWS + 1 && filter === '' && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={6} className="px-3 py-1.5">
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

function LadderStrip({ counts, filter, onPick }: { counts: Record<Step, number>; filter: Filter; onPick: (s: Step) => void }) {
  return (
    <section aria-label="The ladder" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-slate-700">
          <span className="font-bold text-slate-900">The ladder.</span> Rung puts every box on the gentlest step that is still safe. Gentlest on the left. Click a step to filter.
        </p>
        <LadderHelp />
      </div>
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto_minmax(0,1fr)] items-stretch gap-2">
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
              onClick={() => onPick(s)}
              className={`flex flex-col gap-0.5 rounded-lg border-2 border-t-[6px] px-3 py-1.5 text-left transition-colors ${STEP_META[s].rail} ${
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
    </section>
  )
}

function GroupHeader({ step, count }: { step: Step; count: number }) {
  const meta = STEP_META[step]
  const Icon = STEP_ICON[step]
  return (
    <tr className={`border-t border-slate-200 ${meta.soft.split(' ')[0]}`}>
      <td colSpan={6} className={`border-l-[6px] px-3 py-2 ${meta.rail}`}>
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

function Row({ row, onOverride }: { row: QueueRow; onOverride: () => void }) {
  const [open, setOpen] = useState(false)
  const { lfd, reefer, appointment } = row.clocks
  const tags = issueTags(row.fired, row.owner, row.step)
  return (
    <tr className="border-t border-slate-100 align-top hover:bg-slate-50/70">
      <td className="px-3 py-2.5">
        <a href={`#/box/${row.number}`} className="font-mono text-lg font-semibold text-sky-900 underline decoration-sky-300 underline-offset-4 hover:decoration-sky-800">
          {row.number}
        </a>
        <div className="text-slate-700">
          {row.equipment_type}
          {row.equipment_length ? ` ${row.equipment_length} ft` : ''}
        </div>
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
          {row.owner && <span className="text-slate-700">Owner: {row.owner}</span>}
          {row.rated && <span className="rounded bg-amber-300 px-1.5 font-semibold text-indigo-950">Rated order</span>}
          {row.pinned && row.step === 'RELEASE' && <span className="font-semibold text-emerald-800">Pinned to the top</span>}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded-md bg-slate-100 px-2 font-semibold text-slate-800">
              {t}
            </span>
          ))}
        </div>
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
