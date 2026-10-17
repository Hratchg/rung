import { useState } from 'react'
import { useAppState, useScenarioControls, type ScenarioEvent, type State } from './api'
import Queue from './Queue'
import { laneList } from './format'
import { BadgeChip } from './ui'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const SPEEDS = [0, 1, 2, 5, 10]

function clockParts(iso: string) {
  const [date, rest] = iso.split('T')
  const [, month, day] = date.split('-').map(Number)
  return { date: `${MONTHS[month - 1]} ${day}`, time: rest.slice(0, 5) }
}

function payload(event: ScenarioEvent): ScenarioEvent {
  const { t: _t, at: _at, fired: _fired, ...rest } = event
  return rest as ScenarioEvent
}

function Counter({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg border border-current/20 bg-white/5 px-3 py-1">
      <span className="text-base opacity-80">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
      {detail && <span className="text-base opacity-80">{detail}</span>}
    </div>
  )
}

function PollerChip({ poller }: { poller: State['poller'] }) {
  const ok = poller.status === 'ok'
  return (
    <span className={`rounded-md px-2 py-1 text-base font-semibold ${ok ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
      {ok ? `Terminal49 live. ${poller.live_count} boxes` : poller.message}
    </span>
  )
}

function Controls({ state }: { state: State }) {
  const { reset, speed, fire } = useScenarioControls()
  const scripted = (type: string) => state.scripted_events.find((e) => e.type === type)
  const lanesEvent = scripted('lanes_down')
  const holdEvent = scripted('hold_placed')
  const darkEvent = scripted('source_dark')
  const reeferEvent = scripted('reefer_power_off')
  const [reefer, setReefer] = useState('')
  const reeferTarget = reefer && state.powered_reefers.includes(reefer) ? reefer : state.powered_reefers[0] ?? ''

  const lanes = (lanesEvent?.lanes as number[] | undefined) ?? []
  const lanesClosed = lanes.length > 0 && lanes.every((l) => !state.lanes_open.includes(l))
  const darkSource = (darkEvent?.source as string | undefined) ?? 'terminal'
  const isDark = state.dark_sources.includes(darkSource)
  const busy = reset.isPending || fire.isPending || speed.isPending
  const button = 'rounded-md border border-current/40 px-3 py-1 font-semibold hover:bg-white/10 disabled:opacity-50'
  const error = reset.error ?? fire.error ?? speed.error

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => reset.mutate()}>
        Reset
      </button>
      <label className="flex items-center gap-2">
        <span className="opacity-80">Speed</span>
        <select
          className="rounded-md border border-current/40 bg-transparent px-2 py-1 font-semibold [&>option]:text-slate-900"
          value={state.minutes_per_second}
          onChange={(e) => speed.mutate(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Paused' : `${s} min/s`}
            </option>
          ))}
        </select>
      </label>
      {lanesEvent && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => fire.mutate({ type: lanesClosed ? 'lanes_up' : 'lanes_down', lanes })}
        >
          {lanesClosed ? 'Reopen' : 'Close'} lanes {laneList(lanes)}
        </button>
      )}
      {holdEvent && (
        <button type="button" className={button} disabled={busy} onClick={() => fire.mutate(payload(holdEvent))}>
          Hold {String(holdEvent.box)}
        </button>
      )}
      {reeferEvent && state.powered_reefers.length > 0 && (
        <span className="flex items-center gap-1">
          <select
            aria-label="Reefer to cut power on"
            className="rounded-md border border-current/40 bg-transparent px-2 py-1 font-mono [&>option]:text-slate-900"
            value={reeferTarget}
            onChange={(e) => setReefer(e.target.value)}
          >
            {state.powered_reefers.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={button}
            disabled={busy || !reeferTarget}
            onClick={() => fire.mutate({ type: 'reefer_power_off', box: reeferTarget })}
          >
            Cut power
          </button>
        </span>
      )}
      {darkEvent && (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => fire.mutate({ type: isDark ? 'source_back' : 'source_dark', source: darkSource })}
        >
          {`${darkSource.charAt(0).toUpperCase()}${darkSource.slice(1)} feed ${isDark ? 'back' : 'dark'}`}
        </button>
      )}
      {error && <span className="rounded bg-red-100 px-2 py-1 text-red-900">{error.message}</span>}
    </div>
  )
}

function Header({ state }: { state: State }) {
  const { time, date } = clockParts(state.clock)
  const harbor = state.mode === 'harbor_night'
  const closed = Array.from({ length: state.lanes }, (_, i) => i + 1).filter((l) => !state.lanes_open.includes(l))
  const c = state.counters
  return (
    <header className={`sticky top-0 z-20 px-4 py-3 shadow ${harbor ? 'bg-indigo-950 text-white' : 'bg-white text-slate-900'}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <h1 className="text-2xl font-black tracking-tight">
          Rung <span className="font-semibold opacity-70">at {state.terminal}</span>
        </h1>
        <span className={`rounded-md px-3 py-1 text-lg font-bold ${harbor ? 'bg-amber-300 text-indigo-950' : 'bg-sky-100 text-sky-900'}`}>
          {harbor ? 'Harbor Night' : 'Tuesday'}
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{time}</span>
          <span className="text-lg opacity-80">{date}</span>
          <span className="text-lg tabular-nums opacity-70">{state.offset}</span>
        </div>
        <div className="text-lg">
          Lanes open <strong>{state.lanes_open.length}</strong> of {state.lanes}
          {closed.length > 0 && <span className="ml-2 font-semibold text-amber-500">Closed {laneList(closed)}</span>}
        </div>
        {state.dark_sources.length > 0 && (
          <span className="rounded-md bg-red-600 px-2 py-1 font-semibold text-white">Dark feed: {state.dark_sources.join(' and ')}</span>
        )}
        <span className="flex items-center gap-2" title={`${state.legend.live}. ${state.legend.simulated}.`}>
          <BadgeChip kind="live" />
          <BadgeChip kind="simulated" />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Counter label="Released" value={String(c.released)} />
        <Counter label="Reefers powered" value={String(c.reefers_powered)} detail={`${c.reefers_lost} lost`} />
        <Counter label="Demurrage avoided" value={`${c.demurrage_avoided_usd.toLocaleString('en-US')} USD`} />
        <Counter label="Throughput" value={`${c.throughput_pct}%`} />
        <PollerChip poller={state.poller} />
      </div>
      <div className="mt-2">
        <Controls state={state} />
      </div>
    </header>
  )
}

export default function App() {
  const state = useAppState()
  if (!state.data) {
    return (
      <p className="p-6 text-lg">{state.isError ? 'Cannot reach the Rung server. Retrying every 2 seconds.' : 'Loading Pier 7'}</p>
    )
  }
  return (
    <div className="min-h-screen">
      <Header state={state.data} />
      {state.isError && (
        <p className="bg-red-100 px-4 py-2 text-red-900">Lost contact with the Rung server. Showing the last update.</p>
      )}
      <Queue carriers={state.data.carriers} />
    </div>
  )
}
