import { useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDecision, type Planner, type Step } from './api'
import { LADDER, STEP_META, primaryAction } from './copy'
import { sayTime } from './format'
import { Hint, StepChip } from './ui'

export type DecideTarget = {
  number: string
  step: Step
  engine_step: Step
  planner: Planner | null
  fired: string[]
  conflicts: string[]
}

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
  const planner = target.planner
  const action = primaryAction(target.step, target)
  const large = size === 'lg'
  const btn = large ? 'lg' : 'default'
  const hand = target.step === 'HAND'
  return (
    <div className={`flex gap-2 ${large ? 'flex-col items-stretch' : 'flex-col items-start'}`}>
      {planner && (
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
          <Check className="size-5" aria-hidden />
          {planner.action === 'approve' ? `You approved at ${sayTime(planner.at)}` : `You chose ${STEP_META[planner.step].word}`}
        </span>
      )}
      {!planner && !hand && (
        <Hint text={action.hint}>
          <Button size={btn} disabled={decide.isPending} onClick={() => decide.mutate({ box: target.number, action: 'approve' })}>
            {action.label}
          </Button>
        </Hint>
      )}
      {hand && !planner ? (
        <Hint text={action.hint}>
          <Button size={btn} className="bg-violet-700 text-white hover:bg-violet-600" onClick={onOverride}>
            {action.label}
          </Button>
        </Hint>
      ) : (
        <Button variant={large ? 'outline' : 'ghost'} size={large ? 'default' : 'sm'} className={large ? '' : 'px-2 text-slate-700'} onClick={onOverride}>
          <Pencil aria-hidden />
          Change step
        </Button>
      )}
      {large && !planner && <p className="text-slate-600">{action.hint}</p>}
      {decide.isError && <span className="text-red-800">{decide.error.message}</span>}
    </div>
  )
}

export function OverrideDialog({ target, onClose }: { target: DecideTarget; onClose: () => void }) {
  const [step, setStep] = useState<Step | null>(null)
  const [note, setNote] = useState('')
  const decide = useDecision()
  const hand = target.engine_step === 'HAND'
  const submit = () => {
    if (!step) return
    decide.mutate({ box: target.number, action: 'override', step, note }, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {hand ? 'Decide' : 'Change the step for'} <span className="font-mono">{target.number}</span>
          </DialogTitle>
          <DialogDescription>
            {hand
              ? 'Rung could not pick a safe step on its own. Pick the step you want. Your choice and note go to the audit log.'
              : 'Pick a different step if you know something Rung does not. Your choice and note go to the audit log.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <span className="text-slate-700">Rung recommends</span>
          <StepChip step={target.engine_step} />
          <span className="text-slate-700">{STEP_META[target.engine_step].short}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Step">
          {LADDER.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={step === s}
              onClick={() => setStep(s)}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 px-3 py-2 text-left ${
                step === s ? 'border-slate-900 bg-slate-100' : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <StepChip step={s} />
              <span className="text-slate-700">{STEP_META[s].short}</span>
              {s === target.engine_step && <span className="font-semibold text-slate-900">Recommended</span>}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="font-semibold">Note for the audit log</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-base"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you chose this step"
          />
        </label>
        {decide.isError && <p className="text-red-800">{decide.error.message}</p>}
        <DialogFooter className="-mx-6 -mb-6 px-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!step || decide.isPending} onClick={submit}>
            {step ? `Save ${STEP_META[step].word}` : 'Pick a step'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
