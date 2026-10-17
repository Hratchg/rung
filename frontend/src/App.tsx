import { useAppState, type State } from './api'

function clockParts(iso: string) {
  const [date, rest] = iso.split('T')
  return { date, time: rest.slice(0, 5) }
}

function Header({ state }: { state: State }) {
  const { time, date } = clockParts(state.clock)
  const harbor = state.mode === 'harbor_night'
  return (
    <header className="border-b border-slate-300 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Rung</h1>
        <span className={`rounded-md px-3 py-1 font-semibold ${harbor ? 'bg-indigo-900 text-white' : 'bg-sky-100 text-sky-900'}`}>
          {harbor ? 'Harbor Night' : 'Tuesday'}
        </span>
        <div>
          <span className="text-2xl font-semibold tabular-nums">{time}</span>
          <span className="ml-2 text-slate-600">{date} at {state.terminal}</span>
          <span className="ml-2 text-slate-500 tabular-nums">{state.offset}</span>
        </div>
        <div>
          Lanes open <strong>{state.lanes_open.length}</strong> of {state.lanes}
        </div>
      </div>
    </header>
  )
}

export default function App() {
  const state = useAppState()
  return (
    <div className="min-h-screen">
      {state.data ? (
        <Header state={state.data} />
      ) : (
        <p className="p-6 text-lg">{state.isError ? 'Cannot reach the Rung server. Retrying.' : 'Loading Pier 7'}</p>
      )}
    </div>
  )
}
