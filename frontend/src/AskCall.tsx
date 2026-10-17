import { useEffect, useRef, useState } from 'react'
import { useStartCall, type AuditLine, type BoxDetail, type CallOutcome, type CallStart, type TranscriptLine } from './api'
import { sayTime } from './format'

const STATUS: Record<string, string> = {
  registered: 'Connecting',
  ongoing: 'On the call',
  ended: 'Call ended',
  error: 'Call failed',
  not_connected: 'Not connected',
}

const OUTCOME_TONE: Record<CallOutcome, string> = {
  confirmed_empty: 'bg-emerald-100 text-emerald-900 border-emerald-600',
  confirmed_loaded: 'bg-violet-100 text-violet-900 border-violet-600',
  reschedule_accepted: 'bg-amber-100 text-amber-950 border-amber-500',
  unknown: 'bg-red-100 text-red-900 border-red-600',
}

const MODE_TEXT = {
  mock: 'Simulated web call. No Retell key is set, so Rung plays a scripted call.',
  web: 'Web call through Retell in this browser. Allow the microphone when asked.',
  phone: 'Phone call through Retell to the trucker phone on the appointment.',
}

type Live = { status: 'connecting' | 'on' | 'ended' | 'error'; transcript: TranscriptLine[]; error?: string }
type RetellClient = { stopCall: () => void }

export default function AskCall({ box }: { box: BoxDetail }) {
  const start = useStartCall(box.number)
  const [answer, setAnswer] = useState<CallOutcome>(box.ask.default_outcome)
  const [live, setLive] = useState<Live | null>(null)
  const client = useRef<RetellClient | null>(null)
  useEffect(() => () => client.current?.stopCall(), [])

  const call = box.call
  const active = !!call && (call.outcome === null || !['ended', 'error', 'not_connected'].includes(call.status))
  const liveOn = live?.status === 'connecting' || live?.status === 'on'
  const transcript = live && live.transcript.length > (call?.transcript.length ?? 0) ? live.transcript : (call?.transcript ?? [])
  const effect = call ? box.history.find((h: AuditLine) => h.action === 'call_outcome' && h.call_id === call.call_id)?.effect : undefined

  async function startWebCall(res: CallStart & { access_token: string }) {
    setLive({ status: 'connecting', transcript: [] })
    try {
      const { RetellWebClient } = await import('retell-client-js-sdk')
      const web = new RetellWebClient()
      client.current = web
      web.on('call_started', () => setLive((l) => ({ status: 'on', transcript: l?.transcript ?? [] })))
      web.on('update', (u: { transcript?: { role: string; content: string }[] }) =>
        setLive((l) => ({
          status: l?.status ?? 'on',
          transcript: (u.transcript ?? []).map((t) => ({ role: t.role === 'agent' ? 'agent' : 'trucker', content: t.content })),
        })),
      )
      web.on('call_ended', () => setLive((l) => ({ status: 'ended', transcript: l?.transcript ?? [] })))
      web.on('error', (e: unknown) => {
        setLive((l) => ({ status: 'error', transcript: l?.transcript ?? [], error: String(e) }))
        web.stopCall()
      })
      await web.startCall({
        accessToken: res.access_token,
        callId: res.call_id,
        transport: res.transport ?? undefined,
        iceServers: res.ice_servers.length ? res.ice_servers : undefined,
      })
    } catch (e) {
      setLive((l) => ({ status: 'error', transcript: l?.transcript ?? [], error: e instanceof Error ? e.message : String(e) }))
    }
  }

  function ask() {
    start.mutate(box.ask.mode === 'mock' ? answer : null, {
      onSuccess: (res) => {
        if (res.mode === 'web' && !res.mock && res.access_token) void startWebCall({ ...res, access_token: res.access_token })
      },
    })
  }

  return (
    <section className="mt-3 rounded-lg border border-slate-300 bg-white p-4" aria-label="Ask the trucker">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-lg font-bold">Ask the trucker</h3>
        <span className={`rounded-md px-2 py-0.5 font-semibold ${box.ask.mode === 'mock' ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900'}`}>
          {box.ask.mode === 'mock' ? 'Simulated' : box.ask.mode === 'phone' ? 'Retell phone' : 'Retell web'}
        </span>
        <span className="text-slate-700">{MODE_TEXT[box.ask.mode]}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {box.ask.mode === 'mock' && (
            <label className="flex items-center gap-2">
              <span className="text-slate-700">Trucker answer</span>
              <select
                className="rounded border border-slate-400 bg-white px-2 py-1"
                value={answer}
                onChange={(e) => setAnswer(e.target.value as CallOutcome)}
                disabled={active || start.isPending}
              >
                {box.ask.outcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {liveOn && (
            <button type="button" className="rounded-md border border-red-600 px-3 py-1 font-semibold text-red-800 hover:bg-red-50" onClick={() => client.current?.stopCall()}>
              Hang up
            </button>
          )}
          <button
            type="button"
            className="rounded-md bg-sky-700 px-4 py-1.5 text-lg font-semibold text-white hover:bg-sky-800 disabled:opacity-50"
            disabled={!box.ask.available || active || start.isPending || liveOn}
            onClick={ask}
          >
            {start.isPending ? 'Calling' : call ? 'Call again' : 'Ask'}
          </button>
        </div>
      </div>
      {!box.ask.available && <p className="mt-2 text-slate-700">The box has left the terminal. There is nobody to ask.</p>}
      {start.error && <p className="mt-2 rounded bg-red-100 px-3 py-2 text-red-900">{start.error.message}</p>}
      {live?.error && <p className="mt-2 rounded bg-red-100 px-3 py-2 text-red-900">Web call failed: {live.error}</p>}

      {call && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <p className="flex flex-wrap gap-x-3 text-slate-700">
              <span className="font-mono font-semibold text-slate-900">{call.call_id}</span>
              <span>{call.mode === 'phone' ? 'Phone call' : 'Web call'}</span>
              <span>Started {sayTime(call.started_at)}</span>
              <span>
                {call.trucker_name} of {call.dray_carrier}
              </span>
              <span className="font-semibold text-slate-900">{STATUS[live?.status === 'on' ? 'ongoing' : call.status] ?? call.status}</span>
            </p>
            <ol className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto" aria-label="Transcript" aria-live="polite">
              {transcript.length === 0 && <li className="text-slate-600">Waiting for the first words</li>}
              {transcript.map((t, i) => (
                <li key={i} className={`max-w-[85%] rounded-lg px-3 py-1.5 ${t.role === 'agent' ? 'self-start bg-slate-100' : 'self-end bg-sky-50 text-right'}`}>
                  <span className="block text-base font-semibold text-slate-600">{t.role === 'agent' ? 'Gate desk' : call.trucker_name}</span>
                  {t.content}
                </li>
              ))}
            </ol>
          </div>
          <div aria-label="Call outcome">
            {call.outcome ? (
              <div className={`rounded-lg border-l-8 p-3 ${OUTCOME_TONE[call.outcome]}`}>
                <div className="text-base font-semibold">Outcome</div>
                <div className="text-xl font-bold">{call.outcome_label}</div>
                <div className="font-mono">{call.outcome}</div>
                {effect && <p className="mt-2">{effect}</p>}
                {call.notes && <p className="mt-2">Notes: {call.notes}</p>}
                <p className="mt-1">Callback needed: {call.callback_needed ? 'Yes' : 'No'}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-400 p-3 text-slate-700">
                The outcome lands here when the call ends. Rung checks the call every 3 seconds.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
