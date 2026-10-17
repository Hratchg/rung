import { useState } from 'react'
import { SOURCE_NAMES, useBox, type AuditLine, type BoxDetail, type ConflictInfo, type Silence, type SourceName, type Warmup } from './api'
import AskCall from './AskCall'
import { OverrideDialog, PlannerActions } from './Decide'
import { ACTOR, SOURCE_FIELDS, SOURCE_TITLE, STEP_META, sayDateTime, sayHours, sayNum, sayTime, sayValue } from './format'
import { Notice } from './Queue'
import SpoofForm from './Spoof'
import { BadgeChip, CallTags, StepChip, TrustBar, UrgencyBar } from './ui'

const CONFLICT_NAMES: Record<string, string> = {
  C1: 'Weight',
  C2: 'Sync',
  C3: 'Reefer',
  C4: 'Dark source',
  C5: 'Clock',
}

const VALUE_LABELS: Record<string, string> = {
  carrier: 'Carrier says',
  weighbridge: 'Weighbridge says',
  available_for_pickup: 'Terminal says available',
  active_holds: 'Active holds',
  power_on: 'Power on',
  product_temp_c: 'Product',
  set_point_c: 'Set point',
  age_h: 'Silent for',
  pickup_lfd: 'Last free day',
  demurrage_usd: 'Demurrage',
}

export default function BoxCard({ number, onAudit }: { number: string; onAudit: (box: string) => void }) {
  const box = useBox(number)
  const [overriding, setOverriding] = useState(false)

  if (box.isError && !box.data) {
    const missing = box.error.message.includes('not found')
    return (
      <main className="px-4 py-6">
        <BackLink />
        <div className="mt-3">
          <Notice tone="error">{missing ? `There is no box ${number} at Pier 7.` : 'Cannot reach the box card. Retrying every 2 seconds.'}</Notice>
        </div>
      </main>
    )
  }
  if (!box.data) {
    return (
      <main className="px-4 py-6">
        <Notice>Loading box {number}</Notice>
      </main>
    )
  }

  const b = box.data
  const d = b.decision
  const target = { number: b.number, step: d.step, engine_step: d.engine_step, planner: d.planner }
  return (
    <main className="px-4 pb-10 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <BackLink />
        <h2 className="font-mono text-2xl font-bold">{b.number}</h2>
        <span className="text-lg">
          {b.equipment_type}
          {b.equipment_length ? ` ${b.equipment_length} ft` : ''}
        </span>
        {b.appointment ? (
          <span className={`text-lg ${b.clocks.appointment?.lane_closed ? 'font-semibold text-amber-800' : ''}`}>
            {b.clocks.appointment?.label}. {b.appointment.dray_carrier}
          </span>
        ) : (
          <span className="text-lg text-slate-600">No appointment</span>
        )}
        {b.clocks.lfd && <span className={`text-lg ${b.clocks.lfd.hours <= 24 ? 'font-semibold text-red-800' : ''}`}>{b.clocks.lfd.label}</span>}
        {b.rated && <span className="rounded bg-amber-300 px-2 py-0.5 text-lg font-semibold text-indigo-950">{b.rated.label}</span>}
        {b.live ? <BadgeChip kind="live" /> : null}
      </div>

      <section className={`mt-3 rounded-lg border border-slate-300 border-l-8 bg-white p-4 ${STEP_META[d.step].rail}`} aria-label="Decision">
        <div className="flex flex-wrap items-center gap-3">
          <StepChip step={d.step} size="lg" />
          {d.planner?.action === 'override' && <span className="text-slate-700">Rung said {d.engine_step}</span>}
          {d.hand && !d.planner && <span className="rounded bg-violet-100 px-2 py-0.5 text-lg font-semibold text-violet-900">Planner tap</span>}
          {d.pinned && <span className="text-lg font-semibold text-emerald-800">Top of release</span>}
          {d.owner && <span className="text-lg">Owner: <strong>{d.owner}</strong></span>}
          <span className="flex items-center gap-2 text-lg">
            Urgency <UrgencyBar value={d.urgency} />
          </span>
          <div className="ml-auto">
            {d.released_at ? (
              <span className="rounded bg-emerald-100 px-3 py-1 text-lg font-semibold text-emerald-900">Released at {sayTime(d.released_at)}</span>
            ) : (
              <PlannerActions target={target} onOverride={() => setOverriding(true)} size="lg" />
            )}
          </div>
        </div>
        <p className="mt-3 text-xl leading-snug">{d.reason}</p>
      </section>

      <AskCall box={b} />

      <SpoofForm key={b.number} box={b} />

      <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Sources">
        {SOURCE_NAMES.map((name) => (
          <SourcePanel key={name} name={name} box={b} />
        ))}
      </section>

      <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Conflicts conflicts={b.conflicts} />
        <div className="rounded-lg border border-slate-300 bg-white p-4">
          <h3 className="text-lg font-bold">Fired rules</h3>
          {b.fired.length === 0 ? (
            <p className="mt-1 text-slate-700">No rule fired. Rung watches the box and rechecks at the next poll.</p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2">
              {b.fired.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <span className="rounded bg-slate-200 px-1.5 font-mono font-bold">{r.id}</span>
                  <span className="font-semibold">{r.name}</span>
                  <StepChip step={r.step} />
                  {r.twist_tag && <span className="rounded bg-fuchsia-100 px-1.5 font-semibold text-fuchsia-900">Twist {r.twist_tag}</span>}
                  <span className="basis-full text-slate-700">{r.why}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <History lines={b.history} onAudit={() => onAudit(b.number)} />

      {overriding && <OverrideDialog target={target} onClose={() => setOverriding(false)} />}
    </main>
  )
}

function BackLink() {
  return (
    <a href="#/" className="rounded border border-slate-400 bg-white px-3 py-1 font-semibold hover:bg-slate-100">
      Back to queue
    </a>
  )
}

function SourcePanel({ name, box }: { name: SourceName; box: BoxDetail }) {
  const detail = box.sources[name]
  const inConflict = box.conflicts.filter((c) => c.sources.includes(name) && c.code !== 'C4')
  if (!detail) {
    return (
      <article className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-3">
        <h3 className="text-lg font-bold">{SOURCE_TITLE[name]}</h3>
        <p className="mt-1 text-slate-600">{name === 'reefer' ? 'Not a reefer. No telemetry.' : 'No reading for this box.'}</p>
      </article>
    )
  }
  const fields = SOURCE_FIELDS[name]
  return (
    <article
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 ${detail.dark ? 'border-2 border-red-500' : inConflict.length ? 'border-2 border-red-300' : 'border-slate-300'}`}
      aria-label={`${SOURCE_TITLE[name]} source`}
    >
      <header className="flex flex-wrap items-center justify-between gap-1">
        <h3 className="text-lg font-bold">{SOURCE_TITLE[name]}</h3>
        {detail.badge && <BadgeChip kind={detail.badge} />}
      </header>
      <p className={detail.dark ? 'font-semibold text-red-800' : 'text-slate-600'}>
        {detail.dark ? `Dark. Last report ${detail.age} ago` : `Reported ${detail.age} ago`}
      </p>
      <TrustBar value={detail.trust} reason={detail.trust_reason} />
      {inConflict.length > 0 && (
        <p className="font-semibold text-red-800">In conflict {inConflict.map((c) => c.code).join(' and ')}</p>
      )}
      {detail.dark && <p className="text-slate-700">Last known values below. Rung does not use them.</p>}
      <dl className={`flex flex-col gap-1 ${detail.dark ? 'opacity-60' : ''}`}>
        {fields.map(([key, label, fmt]) => (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt className="text-slate-600">{label}</dt>
            <dd className="ml-auto min-w-0 text-right font-semibold break-words">{fmt(detail.fields[key])}</dd>
          </div>
        ))}
      </dl>
      {name === 'reefer' && box.silence && <SilenceLine silence={box.silence} />}
      {name === 'reefer' && box.mode === 'harbor_night' && box.warmup && <WarmupClock warmup={box.warmup} />}
    </article>
  )
}

function silenceDetail(s: Silence): string {
  if (s.kind === 'tripped') {
    return `${s.peers.length} other units on circuit ${s.circuit} went silent within 10 minutes: ${s.peers.join(', ')}.`
  }
  if (s.kind === 'failed') {
    return s.alarm
      ? `Sent the alarm ${s.alarm}, then went silent.`
      : `Drew ${sayNum(s.draw_kw ?? 0)} kW before it went silent, outside the normal 2 to 8 kW band.`
  }
  const draw = s.draw_kw != null ? `Drew a normal ${sayNum(s.draw_kw)} kW before it went quiet.` : 'No draw reading before it went quiet.'
  const peers = s.peers.length ? `Only ${s.peers.join(' and ')} on circuit ${s.circuit} went silent with it.` : 'No other unit on its circuit went silent with it.'
  return `${draw} ${peers}`
}

function SilenceLine({ silence }: { silence: Silence }) {
  return (
    <div className="rounded-md border-2 border-sky-700 bg-sky-50 p-2" aria-label="Silent reefer">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Silent since {sayTime(silence.since)}</span>
        <span className="rounded bg-sky-700 px-1.5 font-semibold text-white">{silence.label}</span>
      </div>
      <p className="mt-1">{silenceDetail(silence)}</p>
    </div>
  )
}

function WarmupClock({ warmup }: { warmup: Warmup }) {
  return (
    <div className="rounded-md border border-amber-500 bg-amber-50 p-2" aria-label="Warm up clock">
      <div className="font-semibold">Warm up clock, scenario hours</div>
      {warmup.power_on ? (
        <p>
          {warmup.silent_since
            ? `Silent since ${sayTime(warmup.silent_since)}. The last report showed the unit cooling, so the clock has not started.`
            : 'Power on. The clock is stopped.'}
        </p>
      ) : (
        <>
          <p className="text-2xl font-bold tabular-nums">{sayHours(warmup.hours_off)}</p>
          <p>
            {warmup.cause === 'fault' ? 'Unit stopped cooling at' : 'Power off since'} {sayDateTime(warmup.off_since)}.
          </p>
          <p className="font-semibold text-red-800">
            {warmup.hours_left && warmup.hours_left > 0
              ? `Product reaches ${sayNum(warmup.limit_c)} C in ${sayHours(warmup.hours_left)}, at ${sayTime(warmup.limit_at)}.`
              : `Product passed ${sayNum(warmup.limit_c)} C at ${sayTime(warmup.limit_at)}.`}
          </p>
        </>
      )}
      <p className="mt-1 text-slate-700">{warmup.note}</p>
    </div>
  )
}

function Conflicts({ conflicts }: { conflicts: ConflictInfo[] }) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white p-4">
        <h3 className="text-lg font-bold">Conflicts</h3>
        <p className="mt-1 text-slate-700">No conflicts. All sources agree.</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border-2 border-red-300 bg-red-50 p-4">
      <h3 className="text-lg font-bold text-red-900">Conflicts {conflicts.length}</h3>
      <ul className="mt-2 flex flex-col gap-3">
        {conflicts.map((c, i) => (
          <li key={`${c.code}-${i}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-700 px-1.5 font-mono font-bold text-white">{c.code}</span>
              <span className="font-semibold text-red-900">{CONFLICT_NAMES[c.code] ?? c.code}</span>
              <span className="text-red-900">{c.sources.map((s) => SOURCE_TITLE[s] ?? s).join(' and ')}</span>
            </div>
            <p className="mt-0.5 text-red-950">{c.sentence}</p>
            <p className="text-red-900">
              {Object.entries(c.values)
                .map(([k, v]) => `${VALUE_LABELS[k] ?? k.replace(/_/g, ' ')}: ${sayValue(k, v)}`)
                .join('. ')}
              .
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function History({ lines, onAudit }: { lines: AuditLine[]; onAudit: () => void }) {
  return (
    <section className="mt-3 rounded-lg border border-slate-300 bg-white p-4" aria-label="Decision history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">Decision history</h3>
        <button type="button" onClick={onAudit} className="rounded border border-slate-400 bg-white px-3 py-1 font-semibold hover:bg-slate-100">
          Open in audit log
        </button>
      </div>
      {lines.length === 0 ? (
        <p className="mt-1 text-slate-700">No decisions recorded for this box since the last reset.</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y divide-slate-200">
          {lines.map((line) => (
            <li key={line.seq} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <span className="w-28 shrink-0 font-semibold tabular-nums">{sayDateTime(line.ts)}</span>
              <span className={`w-20 shrink-0 font-semibold ${ACTOR[line.actor]?.tone ?? 'text-slate-700'}`}>{ACTOR[line.actor]?.label ?? 'Engine'}</span>
              <span className="flex w-60 shrink-0 flex-wrap items-center gap-1.5">
                <StepChip step={line.step} />
                {line.previous_step && line.previous_step !== line.step && <span className="text-slate-600">was {line.previous_step}</span>}
                {line.override && <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-900">Override</span>}
              </span>
              <span className="min-w-0 flex-1">
                {line.call_id && <CallTags line={line} />}
                {line.note && <span className="block font-semibold">Note: {line.note}</span>}
                {line.effect && <span className="block">{line.effect}</span>}
                <span className="block text-slate-700">{line.reason}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
