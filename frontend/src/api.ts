import { useQuery } from '@tanstack/react-query'

export type Counters = {
  released: number
  released_blunt: number
  reefers_powered: number
  reefers_lost: number
  demurrage_avoided_usd: number
  throughput_pct: number
}

export type Poller = {
  live_count: number
  last_ok: string | null
  status: string
  message?: string
}

export type State = {
  terminal: string
  clock: string
  clock_start: string
  offset: string
  minutes_per_second: number
  mode: 'tuesday' | 'harbor_night' | string
  lanes: number
  lanes_open: number[]
  counters: Counters
  legend: { live: string; simulated: string }
  poller: Poller
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export function useAppState() {
  return useQuery({ queryKey: ['state'], queryFn: () => getJson<State>('/api/state') })
}
