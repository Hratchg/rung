import { useState, type FormEvent } from 'react'
import { SOURCE_NAMES, useSpoof, type BoxDetail, type SpoofHoldName, type SpoofResult } from './api'
import { SOURCE_TITLE, sayTime } from './format'
import { StepChip } from './ui'

const MAX_LB = 150_000

function trustChanges(r: SpoofResult): string[] {
  return SOURCE_NAMES.filter((s) => Math.abs(r.before.trust[s] - r.after.trust[s]) >= 0.005).map(
    (s) => `${SOURCE_TITLE[s]} trust ${r.before.trust[s].toFixed(2)} to ${r.after.trust[s].toFixed(2)}`,
  )
}

function ResultLine({ result }: { result: SpoofResult }) {
  const changes = trustChanges(result)
  const moved = result.before.step !== result.after.step
  return (
    <div className="mt-3 rounded-md border border-fuchsia-300 bg-white px-3 py-2" role="status">
      <p className="font-semibold">{result.effect}</p>
      <p className="mt-1 flex flex-wrap items-center gap-2">
        <span>Step</span>
        <StepChip step={result.before.step} />
        {moved ? (
          <>
            <span>to</span>
            <StepChip step={result.after.step} />
          </>
        ) : (
          <span>unchanged</span>
        )}
      </p>
      <p className="mt-1">{changes.length ? `${changes.join('. ')}.` : 'Trust unchanged.'}</p>
    </div>
  )
}

export default function SpoofForm({ box }: { box: BoxDetail }) {
  const spoof = useSpoof(box.number)
  const info = box.spoof
  const [weight, setWeight] = useState('')
  const [hold, setHold] = useState<SpoofHoldName>(info.holds[0]?.name ?? 'customs')
  const active = info.holds.find((h) => h.name === hold)?.active ?? false
  const parsed = Number(weight.replace(/[,\s]/g, ''))
  const typed = weight.trim() !== ''
  const weightOk = typed && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_LB
  const busy = spoof.isPending || !info.available
  const spoofed = Object.entries(info.spoofed)

  function sendWeight(e: FormEvent) {
    e.preventDefault()
    if (weightOk) spoof.mutate({ weight_in_lbs: parsed }, { onSuccess: () => setWeight('') })
  }

  const field = 'rounded border border-slate-400 bg-white px-2 py-1 text-base'
  const button = 'rounded-md border border-fuchsia-700 px-3 py-1 font-semibold text-fuchsia-900 hover:bg-fuchsia-100 disabled:opacity-50'
  return (
    <section className="mt-3 rounded-lg border-2 border-dashed border-fuchsia-400 bg-fuchsia-50/60 p-4" aria-label="Spoof input">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-lg font-bold">Spoof input</h3>
        <span className="text-slate-700">For judges. Fake a reading and Rung re-evaluates the box at once. Each spoof writes an audit line.</span>
      </div>
      {!info.available ? (
        <p className="mt-2 text-slate-700">The box has left the terminal. There is nothing left to spoof.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-3">
          <form onSubmit={sendWeight} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              <span className="text-base text-slate-600">Carrier weight in lb</span>
              <input
                inputMode="numeric"
                className={`${field} w-44 tabular-nums`}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={info.weight_in_lbs != null ? `Now ${info.weight_in_lbs.toLocaleString('en-US')}` : 'Not set'}
                aria-invalid={typed && !weightOk}
              />
            </label>
            <button type="submit" className={button} disabled={busy || !weightOk}>
              Send weight
            </button>
          </form>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">
              <span className="text-base text-slate-600">Hold</span>
              <select className={field} value={hold} onChange={(e) => setHold(e.target.value as SpoofHoldName)}>
                {info.holds.map((h) => (
                  <option key={h.name} value={h.name}>
                    {h.label}
                    {h.active ? ', active' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={button} disabled={busy} onClick={() => spoof.mutate({ hold: { name: hold, on: !active } })}>
              {active ? 'Clear hold' : 'Place hold'}
            </button>
          </div>
          {spoofed.length > 0 && (
            <p className="pb-1 text-slate-700">
              Spoofed {spoofed.map(([source, at]) => `${SOURCE_TITLE[source] ?? source} at ${sayTime(at)}`).join(', ')}
            </p>
          )}
        </div>
      )}
      {typed && !weightOk && <p className="mt-2 text-red-800">Type a whole number of pounds from 0 to 150,000.</p>}
      {spoof.error && <p className="mt-2 rounded bg-red-100 px-3 py-2 text-red-900">{spoof.error.message}</p>}
      {spoof.data && <ResultLine result={spoof.data} />}
    </section>
  )
}
