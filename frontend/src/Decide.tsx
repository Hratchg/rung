import { useState } from 'react'
import { STEPS, useDecision, type Planner, type Step } from './api'
import { StepChip } from './ui'

const APPROVE_LABEL: Record<Step, string> = {
  RELEASE: 'Release',
  WATCH: 'Approve',
  ASK: 'Run ask',
  SLOW: 'Approve',
  HOLD: 'Approve',
  HAND: 'Decide',
}

export type DecideTarget = { number: string; step: Step; engine_step: Step; planner: Planner | null }

export function PlannerActions({
  target,
  onOverride,
  size = 'md',
}: {
  target: DecideTarget
  onOverride: () => void
  size?: 'md' | 'lg'
}) {
  const decide = useDecision()
  const approved = target.planner?.action === 'approve'
  const overridden = target.planner?.action === 'override'
  const pad = size === 'lg' ? 'px-4 py-2 text-lg' : 'px-3 py-1.5'
  return (
    <div className={`flex gap-1.5 ${size === 'lg' ? 'flex-row flex-wrap items-center gap-2' : 'flex-col'}`}>
      {approved && <span className="font-semibold text-emerald-800">Approved</span>}
      {overridden && <span className="font-semibold text-violet-800">Planner set {target.planner!.step}</span>}
      {!approved && target.step !== 'HAND' && (
        <button
          type="button"
          disabled={decide.isPending}
          onClick={() => decide.mutate({ box: target.number, action: 'approve' })}
          className={`rounded bg-slate-900 font-semibold text-white hover:bg-slate-700 disabled:opacity-50 ${pad}`}
        >
          {APPROVE_LABEL[target.step]}
        </button>
      )}
      <button
        type="button"
        onClick={onOverride}
        className={`rounded font-semibold ${pad} ${
          target.step === 'HAND' ? 'bg-violet-700 text-white hover:bg-violet-600' : 'border border-slate-400 bg-white hover:bg-slate-100'
        }`}
      >
        {target.step === 'HAND' ? 'Decide' : 'Override'}
      </button>
      {decide.isError && <span className="text-red-800">{decide.error.message}</span>}
    </div>
  )
}

export function OverrideDialog({ target, onClose }: { target: DecideTarget; onClose: () => void }) {
  const [step, setStep] = useState<Step | null>(null)
  const [note, setNote] = useState('')
  const decide = useDecision()
  const submit = () => {
    if (!step) return
    decide.mutate({ box: target.number, action: 'override', step, note }, { onSuccess: onClose })
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-title"
        className="w-full max-w-xl rounded-xl bg-white p-6 text-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3 id="override-title" className="text-xl font-bold">
          {target.step === 'HAND' ? 'Decide' : 'Override'} <span className="font-mono">{target.number}</span>
        </h3>
        <p className="mt-1 text-slate-700">
          Rung recommends <StepChip step={target.engine_step} />. Pick the step you want instead.
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
              {s === target.engine_step && <span className="ml-2 text-slate-600">Recommended</span>}
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
