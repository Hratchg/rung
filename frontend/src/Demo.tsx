import { useState } from 'react'
import { Check, ChevronUp, FileText, FlaskConical, RotateCcw, Siren } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRatedToggle, useScenarioControls, type ScenarioEvent, type State } from './api'
import { DEMO_NOTE, describeEvent } from './copy'
import { laneList, sayTime } from './format'
import { nightMode } from './mode'

const SPEEDS = [0, 1, 2, 5, 10]

const CRISIS_AT = '+00:44'

function clockAfter(startIso: string, offset: string): string {
  const [h, m] = startIso.slice(11, 16).split(':').map(Number)
  const [oh, om] = offset.slice(1).split(':').map(Number)
  const total = (h * 60 + m + oh * 60 + om) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

type ReeferAction = 'power' | 'trip' | 'telemetry' | 'fail'

const FAULT_ALARM = 'compressor fault'

function payload(event: ScenarioEvent): ScenarioEvent {
  const { t: _t, at: _at, fired: _fired, ...rest } = event
  return rest as ScenarioEvent
}

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
  return `${describeEvent(applied)}.`
}

const select = 'h-9 rounded-lg border border-amber-300/50 bg-zinc-800 px-2 text-base text-zinc-50'

function ReeferControls({ state, busy, onFire }: { state: State; busy: boolean; onFire: (e: ScenarioEvent) => void }) {
  const healthy = state.reefers.filter((r) => r.power_on && !r.silent)
  const [reefer, setReefer] = useState('')
  const [action, setAction] = useState<ReeferAction>('power')
  const target = healthy.find((r) => r.number === reefer) ?? healthy[0]
  if (!target) return <p className="text-zinc-300">Every reefer is already off or silent.</p>
  const actions: [ReeferAction, string][] = [
    ['power', 'Cut power'],
    ['trip', target.circuit ? `Trip circuit ${target.circuit}` : 'Trip circuit'],
    ['telemetry', 'Drop telemetry'],
    ['fail', 'Fail the unit'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Reefer" className={`${select} font-mono`} value={target.number} onChange={(e) => setReefer(e.target.value)}>
        {healthy.map((r) => (
          <option key={r.number} value={r.number}>
            {r.number}
            {r.circuit ? ` ${r.circuit}` : ''}
          </option>
        ))}
      </select>
      <select aria-label="Reefer fault" className={`${select} font-semibold`} value={action} onChange={(e) => setAction(e.target.value as ReeferAction)}>
        {actions.map(([id, label]) => (
          <option key={id} value={id} disabled={id === 'trip' && !target.circuit}>
            {label}
          </option>
        ))}
      </select>
      <Button variant="demo" size="sm" disabled={busy} onClick={() => onFire(reeferEvent(action, target.number, target.circuit))}>
        Apply
      </Button>
    </div>
  )
}

function RatedSwitch({ rated }: { rated: State['rated'] }) {
  const toggle = useRatedToggle()
  if (!rated.available) return null
  const by = sayTime(rated.deadline)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={rated.on}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(!rated.on)}
        title={`${rated.boxes.length} rated boxes: ${rated.boxes.join(', ')}. Plus 50 urgency and a gate out deadline at ${by}.`}
        className={`flex h-9 items-center gap-2 rounded-lg border px-3 font-semibold disabled:opacity-50 ${
          rated.on ? 'border-amber-300 bg-amber-300 text-zinc-950' : 'border-amber-300/50 hover:bg-white/10'
        }`}
      >
        <span className={`relative h-5 w-9 rounded-full ${rated.on ? 'bg-zinc-900' : 'bg-white/30'}`}>
          <span className={`absolute top-0.5 size-4 rounded-full transition-[left] duration-150 ${rated.on ? 'left-[18px] bg-amber-300' : 'left-0.5 bg-white'}`} />
        </span>
        Rated orders {rated.on ? 'on' : 'off'}
      </button>
      <span className="text-zinc-300">
        {rated.boxes.length} boxes must be out by {by}
      </span>
      {toggle.error && <span className="rounded bg-red-100 px-2 text-red-900">{toggle.error.message}</span>}
    </div>
  )
}

function NightSwitch({ state, busy, onEveryday, onCrisis }: { state: State; busy: boolean; onEveryday: () => void; onCrisis: () => void }) {
  const crisis = nightMode(state.mode) === 'crisis'
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Jump to a night">
      <span className="mr-1 hidden text-zinc-300 sm:inline">Night</span>
      <Button
        variant="demo"
        size="sm"
        aria-pressed={!crisis}
        disabled={busy}
        title="Start over at 22:00 on an ordinary Tuesday. Clears every decision, call, and spoof."
        onClick={onEveryday}
      >
        <RotateCcw aria-hidden />
        Everyday
      </Button>
      <Button
        variant="demo"
        size="sm"
        aria-pressed={crisis}
        disabled={busy}
        title={`Jump to ${clockAfter(state.clock_start, CRISIS_AT)} on Harbor Night, after the scripted crisis events have fired.`}
        onClick={onCrisis}
      >
        <Siren aria-hidden />
        Crisis
      </Button>
    </div>
  )
}

export default function DemoDock({ state, onTwist, onPrompt }: { state: State; onTwist: () => void; onPrompt: () => void }) {
  const [open, setOpen] = useState(false)
  const { reset, speed, fire, jump } = useScenarioControls()
  const scripted = (type: string) => state.scripted_events.find((e) => e.type === type)
  const lanesEvent = scripted('lanes_down')
  const holdEvent = scripted('hold_placed')
  const darkEvent = scripted('source_dark')
  const next = state.scripted_events.find((e) => !e.fired)

  const lanes = (lanesEvent?.lanes as number[] | undefined) ?? []
  const lanesClosed = lanes.length > 0 && lanes.every((l) => !state.lanes_open.includes(l))
  const darkSource = (darkEvent?.source as string | undefined) ?? 'terminal'
  const isDark = state.dark_sources.includes(darkSource)
  const busy = reset.isPending || fire.isPending || speed.isPending || jump.isPending
  const error = reset.error ?? fire.error ?? speed.error ?? jump.error
  const note = fire.isSuccess ? appliedNote(fire.data.applied) : null

  return (
    <section aria-label="Demo controls" className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-dashed border-amber-400 bg-zinc-900 text-zinc-50 shadow-[0_-4px_16px_rgba(0,0,0,0.25)]">
      {open && (
        <div className="max-h-[50vh] overflow-y-auto border-b border-white/10 px-4 py-3">
          <p className="mb-3 text-zinc-300">{DEMO_NOTE}</p>
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-amber-300">Fire an event now</h3>
              <div className="flex flex-wrap gap-2">
                {lanesEvent && (
                  <Button variant="demo" size="sm" disabled={busy} onClick={() => fire.mutate({ type: lanesClosed ? 'lanes_up' : 'lanes_down', lanes })}>
                    {lanesClosed ? 'Reopen' : 'Close'} lanes {laneList(lanes)}
                  </Button>
                )}
                {holdEvent && (
                  <Button variant="demo" size="sm" disabled={busy} onClick={() => fire.mutate(payload(holdEvent))}>
                    Customs hold on {String(holdEvent.box)}
                  </Button>
                )}
                {darkEvent && (
                  <Button variant="demo" size="sm" disabled={busy} onClick={() => fire.mutate({ type: isDark ? 'source_back' : 'source_dark', source: darkSource })}>
                    {isDark ? 'Restore' : 'Cut'} {darkSource} feed
                  </Button>
                )}
              </div>
              <h3 className="mt-1 font-bold text-amber-300">Reefer fault</h3>
              <ReeferControls state={state} busy={busy} onFire={(e) => fire.mutate(e)} />
              <h3 className="mt-1 font-bold text-amber-300">Rated orders</h3>
              <RatedSwitch rated={state.rated} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-bold text-amber-300">Scripted timeline</h3>
              <ol className="flex flex-col gap-1">
                {state.scripted_events.map((e) => (
                  <li key={`${e.t}-${e.type}`} className={`flex items-center gap-2 ${e.fired ? 'text-zinc-400' : ''}`}>
                    <span className="w-16 font-mono tabular-nums">{e.t}</span>
                    {e.fired ? <Check className="size-4 text-emerald-400" aria-label="Fired" /> : <span className="size-4" />}
                    <span>{describeEvent(e)}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button variant="demo" size="sm" onClick={onTwist}>
                  <FlaskConical aria-hidden />
                  Twist log
                </Button>
                <Button variant="demo" size="sm" className="sm:hidden" onClick={onPrompt}>
                  <FileText aria-hidden />
                  Voice agent prompt
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <span className="rounded-md bg-amber-400 px-2 py-0.5 font-bold text-zinc-950">
          Demo<span className="hidden sm:inline"> controls</span>
        </span>
        <span className="hidden tabular-nums text-zinc-300 sm:inline">
          Scenario <span className="font-mono font-semibold text-zinc-50">{state.offset}</span>
        </span>
        <NightSwitch state={state} busy={busy} onEveryday={() => reset.mutate()} onCrisis={() => jump.mutate(CRISIS_AT)} />
        <div className="flex items-center gap-1" role="group" aria-label="Speed in scenario minutes per second">
          <span className="mr-1 hidden text-zinc-300 sm:inline" title="Scenario minutes for each real second">
            Speed
          </span>
          {SPEEDS.map((s) => (
            <Button key={s} variant="demo" size="sm" className="px-2.5" aria-pressed={state.minutes_per_second === s} onClick={() => speed.mutate(s)}>
              {s === 0 ? 'Pause' : s}
            </Button>
          ))}
        </div>
        <span className="hidden min-w-0 flex-1 basis-0 truncate text-zinc-300 2xl:inline">
          {next ? (
            <>
              Next <span className="font-mono">{next.t}</span> {describeEvent(next)}
            </>
          ) : (
            'Every scripted event has fired'
          )}
        </span>
        {error && <span className="rounded bg-red-100 px-2 text-red-900">{error.message}</span>}
        {note && <span className="rounded bg-amber-100 px-2 text-amber-950">{note}</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="demo" size="sm" className="hidden sm:inline-flex" onClick={onPrompt}>
            <FileText aria-hidden />
            Voice agent prompt
          </Button>
          <Button variant="demo" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Fewer' : 'More'}
            <span className="hidden sm:inline"> controls</span>
            <ChevronUp className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  )
}
