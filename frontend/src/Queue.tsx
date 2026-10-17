import { useMemo, useState, type ReactNode } from 'react'
import { STEPS, useDecision, useQueue, type QueueRow, type Step } from './api'
import { GROUP_ORDER, STEP_META } from './format'
import { SourceBadges, StepChip, UrgencyBar } from './ui'

const APPROVE_LABEL: Record<Step, string> = {
  RELEASE: 'Release',
  WATCH: 'Approve',
  ASK: 'Run ask',
  SLOW: 'Approve',
  HOLD: 'Approve',
  HAND: 'Decide',
}

export default function Queue({ carriers }: { carriers: string[] }) {
  const [carrier, setCarrier] = useState('')
  const [step, setStep] = useState('')
  const [overriding, setOverriding] = useState<QueueRow | null>(null)
  const queue = useQueue({ carrier, step })
  const rows = queue.data
  const groups = useMemo(() => {
    const byStep = new Map<Step, QueueRow[]>()
    for (const row of rows ?? []) {
      const list = byStep.get(row.step) ?? []
      list.push(row)
      byStep.set(row.step, list)
    }
    return GROUP_ORDER.filter((s) => byStep.has(s)).map((s) => ({ step: s, rows: byStep.get(s)! }))
  }, [rows])

  return (
    <main className="px-4 pb-10 pt-4">
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <h2 className="mr-2 text-xl font-bold">Gate queue</h2>
        <label className="flex flex-col">
          <span className="text-base text-slate-600">Dray carrier</span>
          <select className="rounded border border-slate-300 bg-white px-2 py-1 text-base" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">All carriers</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-base text-slate-600">Step</span>
          <select className="rounded border border-slate-300 bg-white px-2 py-1 text-base" value={step} onChange={(e) => setStep(e.target.value)}>
            <option value="">All steps</option>
            {GROUP_ORDER.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {rows && (
          <p className="pb-1 text-base text-slate-600">
            {rows.length} boxes waiting. {groups.map((g) => `${g.rows.length} ${g.step}`).join(', ')}.
          </p>
        )}
      </div>

      {queue.isError && !rows && <Notice tone="error">Cannot reach the queue. Retrying every 2 seconds.</Notice>}
      {queue.isPending && <Notice>Loading the queue</Notice>}
      {rows && rows.length === 0 && <Notice>No boxes match these filters.</Notice>}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-300 bg-white">
          <table className="w-full min-w-[1200px] table-fixed border-collapse text-left text-base">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[112px]" />
              <col className="w-[156px]" />
              <col />
              <col className="w-[220px]" />
              <col className="w-[128px]" />
              <col className="w-[128px]" />
            </colgroup>
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">Box</th>
                <th className="px-3 py-2 font-semibold">Urgency</th>
                <th className="px-3 py-2 font-semibold">Step</th>
                <th className="px-3 py-2 font-semibold">Reason</th>
                <th className="px-3 py-2 font-semibold">Clocks</th>
                <th className="px-3 py-2 font-semibold">Sources</th>
                <th className="px-3 py-2 font-semibold">Planner</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.step}>
                <tr className="bg-slate-100">
                  <td colSpan={7} className={`border-l-8 px-3 py-2 ${STEP_META[group.step].rail}`}>
                    <div className="flex items-center gap-3">
                      <StepChip step={group.step} />
                      <span className="text-lg font-semibold">{group.rows.length} boxes</span>
                      <span className="text-slate-700">{STEP_META[group.step].meaning}.</span>
                    </div>
                  </td>
                </tr>
                {group.rows.map((row) => (
                  <Row key={row.number} row={row} onOverride={() => setOverriding(row)} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {overriding && <OverrideDialog row={overriding} onClose={() => setOverriding(null)} />}
    </main>
  )
}

function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <p className={`rounded-lg border px-4 py-6 text-center text-lg ${tone === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-slate-300 bg-white text-slate-700'}`}>
      {children}
    </p>
  )
}

function Row({ row, onOverride }: { row: QueueRow; onOverride: () => void }) {
  const [open, setOpen] = useState(false)
  const decide = useDecision()
  const approved = row.planner?.action === 'approve'
  const overridden = row.planner?.action === 'override'
  const { lfd, reefer, appointment } = row.clocks
  return (
    <tr className="border-t border-slate-200 align-top hover:bg-slate-50">
      <td className="px-3 py-2">
        <div className="font-mono text-lg font-semibold">{row.number}</div>
        <div className="text-slate-600">
          {row.equipment_type}
          {row.equipment_length ? ` ${row.equipment_length} ft` : ''}
        </div>
        {row.dray_carrier && <div className="text-slate-600">{row.dray_carrier}</div>}
      </td>
      <td className="px-3 py-2">
        <UrgencyBar value={row.urgency} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          <StepChip step={row.step} />
          {row.pinned && <span className="font-semibold text-emerald-800">Top of release</span>}
          {row.hand && !row.planner && <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-900">Planner tap</span>}
          {row.owner && <span className="text-slate-700">Owner: {row.owner}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <button type="button" onClick={() => setOpen(!open)} className={`text-left ${open ? '' : 'line-clamp-3'}`} title={open ? 'Show less' : row.reason}>
          {row.reason}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-0.5">
          {lfd && <span className={lfd.hours <= 24 ? 'font-semibold text-red-800' : ''}>{lfd.label}</span>}
          {reefer && <span className={reefer.power_on ? '' : 'font-semibold text-red-800'}>{reefer.label}</span>}
          {appointment ? (
            <span className={appointment.lane_closed ? 'font-semibold text-amber-800' : ''}>{appointment.label}</span>
          ) : (
            <span className="text-slate-500">No appointment</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <SourceBadges badges={row.badges} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1.5">
          {approved && <span className="font-semibold text-emerald-800">Approved</span>}
          {overridden && <span className="font-semibold text-violet-800">Planner set {row.planner!.step}</span>}
          {!approved && row.step !== 'HAND' && (
            <button
              type="button"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ box: row.number, action: 'approve' })}
              className="rounded bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {APPROVE_LABEL[row.step]}
            </button>
          )}
          <button
            type="button"
            onClick={onOverride}
            className={`rounded px-3 py-1.5 font-semibold ${row.step === 'HAND' ? 'bg-violet-700 text-white hover:bg-violet-600' : 'border border-slate-400 bg-white hover:bg-slate-100'}`}
          >
            {row.step === 'HAND' ? 'Decide' : 'Override'}
          </button>
          {decide.isError && <span className="text-red-800">{decide.error.message}</span>}
        </div>
      </td>
    </tr>
  )
}

function OverrideDialog({ row, onClose }: { row: QueueRow; onClose: () => void }) {
  const [step, setStep] = useState<Step | null>(null)
  const [note, setNote] = useState('')
  const decide = useDecision()
  const submit = () => {
    if (!step) return
    decide.mutate({ box: row.number, action: 'override', step, note }, { onSuccess: onClose })
  }
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-title"
        className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3 id="override-title" className="text-xl font-bold">
          {row.step === 'HAND' ? 'Decide' : 'Override'} <span className="font-mono">{row.number}</span>
        </h3>
        <p className="mt-1 text-slate-700">
          Rung recommends <StepChip step={row.engine_step} />. Pick the step you want instead.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={step === s}
              onClick={() => setStep(s)}
              className={`rounded-lg border-2 px-3 py-2 text-left ${step === s ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-400'}`}
            >
              <StepChip step={s} />
              {s === row.engine_step && <span className="ml-2 text-slate-600">Recommended</span>}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="text-base font-semibold">Note for the audit log</span>
          <textarea
            className="mt-1 w-full rounded border border-slate-300 p-2 text-base"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you chose this step"
          />
        </label>
        {decide.isError && <p className="mt-2 text-red-800">{decide.error.message}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-slate-400 px-4 py-2 font-semibold hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!step || decide.isPending}
            onClick={submit}
            className="rounded bg-slate-900 px-4 py-2 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Save decision
          </button>
        </div>
      </div>
    </div>
  )
}
