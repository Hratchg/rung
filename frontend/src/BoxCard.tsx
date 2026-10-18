import { useState, type ReactNode } from 'react'
import { ArrowLeft, CircleCheck, Database, FileText, Fuel, Phone, ScrollText, Snowflake, TriangleAlert, Vote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SOURCE_NAMES, useAppState, useBox, type AuditLine, type Badge, type BoxDetail, type ConflictInfo, type Idle, type Silence, type SourceName, type Warmup } from './api'
import AskCall from './AskCall'
import { ACTOR, CONFLICT_COPY, IDLE_TONE, STEP_META, emissionsNote, nextStepLine, sentences, trustLevel } from './copy'
import { OverrideDialog, PlannerActions } from './Decide'
import { SOURCE_FIELDS, SOURCE_TITLE, sayDateTime, sayHours, sayKg, sayNum, sayTime, sayValue } from './format'
import { Notice, plainLfd } from './Queue'
import { sourceVia } from './region'
import SpoofForm from './Spoof'
import { BadgeChip, CallTags, InfoHint, MiniLadder, NeedsYou, Section, SourceBadges, StepChip, TrustBar, UrgencyHelp, UrgencyMeter } from './ui'

const VALUE_LABELS: Record<string, string> = {
  carrier: 'Manifest says',
  weighbridge: 'Scale says',
  available_for_pickup: 'Terminal says available',
  active_holds: 'Active holds',
  power_on: 'Power on',
  product_temp_c: 'Product',
  set_point_c: 'Set point',
  age_h: 'Silent for',
  pickup_lfd: 'Last free day',
  demurrage_usd: 'Demurrage',
}

export default function BoxCard({ number, onAudit, onPrompt }: { number: string; onAudit: (box: string) => void; onPrompt: () => void }) {
  const box = useBox(number)
  const [overriding, setOverriding] = useState(false)

  if (box.isError && !box.data) {
    const missing = box.error.message.includes('not found')
    return (
      <main className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-4">
        <BackLink />
        <Notice tone="error">{missing ? `There is no box ${number} at Pier 7.` : 'Cannot reach the box card. Retrying every 2 seconds.'}</Notice>
      </main>
    )
  }
  if (!box.data) {
    return (
      <main className="mx-auto max-w-[1400px] px-4 py-4">
        <Notice>Loading box {number}</Notice>
      </main>
    )
  }

  const b = box.data
  const d = b.decision
  const target = { number: b.number, step: d.step, engine_step: d.engine_step, planner: d.planner, fired: d.fired, conflicts: d.conflicts }
  const callUp = !!b.call || (b.ask.available && (!!b.ask.weight_case || (d.conflicts.includes('C1') && d.step === 'ASK')))
  const reeferUp = !!b.silence || (b.mode === 'harbor_night' && !!b.warmup && (!b.warmup.power_on || !!b.warmup.silent_since))

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 pt-3 pb-6">
      <Identity box={b} />

      <section className={`grid gap-6 rounded-xl border border-l-8 border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_280px] ${STEP_META[d.step].rail}`} aria-label="Decision">
        <div className="min-w-0">
          <p className="font-semibold text-slate-600">Rung recommends</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <StepChip step={d.step} size="xl" />
            <span className={`text-2xl font-bold ${STEP_META[d.step].text}`}>{STEP_META[d.step].short}</span>
            {d.hand && !d.planner && <NeedsYou />}
          </div>
          <p className="mt-3 text-2xl leading-snug font-semibold text-slate-900">{nextStepLine(d.step, d.owner, d)}</p>
          {d.planner?.action === 'override' && (
            <p className="mt-1 text-lg text-slate-700">
              You changed the step. Rung on its own says {STEP_META[d.engine_step].word}.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-3">
            <Fact label="Owner">{d.owner ?? 'No outside owner'}</Fact>
            <Fact
              label={
                <span className="inline-flex items-center gap-1">
                  Urgency <UrgencyHelp />
                </span>
              }
            >
              <UrgencyMeter value={d.urgency} large />
            </Fact>
            <Fact label="On the ladder">
              <MiniLadder step={d.step} />
            </Fact>
          </div>
          {b.idle && <IdleLine idle={b.idle} />}
        </div>
        <div className="flex flex-col gap-2 lg:border-l lg:border-slate-200 lg:pl-6">
          <p className="font-semibold text-slate-600">Your move</p>
          {d.released_at ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-lg font-semibold text-emerald-900">
              <CircleCheck className="size-5" aria-hidden />
              Released at {sayTime(d.released_at)}
            </span>
          ) : (
            <PlannerActions target={target} onOverride={() => setOverriding(true)} size="lg" />
          )}
        </div>
      </section>

      {callUp && <AskCall box={b} onPrompt={onPrompt} />}
      {reeferUp && <ReeferCard box={b} />}

      <div className="grid gap-3 lg:grid-cols-2">
        <WhyCard box={b} />
        <Conflicts conflicts={b.conflicts} />
      </div>

      <Section title="Sources and trust" icon={<Database className="size-5 text-slate-500" aria-hidden />} summary={<TrustSummary box={b} />} label="Sources">
        <p className="mb-3 text-slate-700">
          Rung reads five sources for every box. Trust starts from how reliable a source is, fades as its reading ages, and drops for every conflict it is in. Hover a trust bar for the arithmetic.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SOURCE_NAMES.map((name) => (
            <SourcePanel key={name} name={name} box={b} />
          ))}
        </div>
      </Section>

      {!callUp && (
        <Section title="Call the trucker" icon={<Phone className="size-5 text-slate-500" aria-hidden />} summary="The voice agent can call the trucker about this box.">
          <AskCall box={b} embedded onPrompt={onPrompt} />
        </Section>
      )}

      <Section title="Full reason" icon={<FileText className="size-5 text-slate-500" aria-hidden />} summary="As written to the audit log">
        <p className="text-xl leading-snug">{d.reason}</p>
      </Section>

      <History lines={b.history} onAudit={() => onAudit(b.number)} />

      <Section title="Demo: fake a reading" tone="demo" summary="For judges. Type a fake weight or toggle a hold and watch Rung react." label="Spoof input">
        <SpoofForm key={b.number} box={b} />
      </Section>

      {overriding && <OverrideDialog target={target} onClose={() => setOverriding(false)} />}
    </main>
  )
}

function BackLink() {
  return (
    <Button variant="outline" asChild>
      <a href="#/">
        <ArrowLeft aria-hidden />
        Queue
      </a>
    </Button>
  )
}

function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-slate-600">{label}</span>
      <span className="text-lg font-semibold">{children}</span>
    </div>
  )
}

function IdleLine({ idle }: { idle: Idle }) {
  const emissions = useAppState().data?.emissions
  const amount = idle.minutes === 0 ? 'No idle' : `${sayHours(idle.minutes / 60)}, ${sayKg(idle.co2_kg)} kg CO2`
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-lg" aria-label="Truck idle">
      <Fuel className="size-5 text-slate-500" aria-hidden />
      <span className="text-slate-600">Truck idle at the gate</span>
      <strong className={IDLE_TONE[idle.cause]}>{amount}</strong>
      <span className="text-slate-700">{sentences(idle.label)[0]}</span>
      <span className="text-slate-500">Modelled</span>
      <InfoHint label="How truck idle is counted" text={`${idle.label} ${emissionsNote(emissions)}`} />
    </p>
  )
}

function Identity({ box }: { box: BoxDetail }) {
  const badges = Object.fromEntries(SOURCE_NAMES.map((s) => [s, box.sources[s]?.badge ?? null])) as Record<SourceName, Badge>
  const appt = box.clocks.appointment
  const cargo = box.sources.reefer?.fields.cargo
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <BackLink />
      <h2 className="font-mono text-3xl font-bold">{box.number}</h2>
      <span>
        {box.equipment_type}
        {box.equipment_length ? ` ${box.equipment_length} ft` : ''}
        {typeof cargo === 'string' ? `, ${cargo}` : ''}
      </span>
      {box.appointment ? (
        <span className={`${appt?.lane_closed ? 'font-semibold text-amber-800' : ''}`}>
          {box.appointment.dray_carrier}. Slot {appt?.window} lane {appt?.lane}
          {appt?.lane_closed ? ', lane closed' : ''}
        </span>
      ) : (
        <span className="text-slate-600">No appointment</span>
      )}
      {box.clocks.lfd && <span className={`${box.clocks.lfd.hours <= 24 ? 'font-semibold text-red-800' : ''}`}>{plainLfd(box.clocks.lfd.label)}</span>}
      {box.rated && <span className="rounded bg-amber-300 px-2 py-0.5 text-lg font-semibold text-indigo-950">{box.rated.label}</span>}
      <SourceBadges badges={badges} />
    </div>
  )
}

function WhyCard({ box }: { box: BoxDetail }) {
  const d = box.decision
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Why">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <Vote className="size-5 text-slate-500" aria-hidden />
        Why Rung says {STEP_META[d.engine_step].word}
      </h3>
      <p className="text-slate-600">Each rule that fits votes for a step. The strongest vote wins.</p>
      {box.fired.length === 0 ? (
        <p className="mt-2 text-slate-700">No rule fired, so Rung watches the box and checks again at the next update.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {box.fired.map((r) => {
            const wins = r.step === d.engine_step
            return (
              <li key={r.id} className={`flex items-start gap-3 rounded-lg px-2 py-1.5 ${wins ? 'bg-slate-100' : ''}`}>
                <span className="w-[104px] shrink-0">
                  <StepChip step={r.step} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={wins ? 'font-semibold text-slate-900' : 'text-slate-700'}>{r.why}</span>
                  <span className="mt-0.5 block text-slate-500">
                    {wins ? 'Winning vote. ' : ''}
                    Rule {r.id}, {r.name}
                    {r.twist_tag ? `. Twist ${r.twist_tag}` : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function Conflicts({ conflicts }: { conflicts: ConflictInfo[] }) {
  if (conflicts.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Conflicts">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <CircleCheck className="size-5 text-emerald-700" aria-hidden />
          Where the sources disagree
        </h3>
        <p className="mt-1 text-slate-700">Nowhere. All five sources agree.</p>
      </section>
    )
  }
  return (
    <section className="rounded-xl border-2 border-red-300 bg-red-50 p-4" aria-label="Conflicts">
      <h3 className="flex items-center gap-2 text-lg font-bold text-red-900">
        <TriangleAlert className="size-5" aria-hidden />
        Where the sources disagree
        <span className="rounded bg-red-700 px-2 text-white">{conflicts.length}</span>
      </h3>
      <ul className="mt-2 flex flex-col gap-3">
        {conflicts.map((c, i) => (
          <li key={`${c.code}-${i}`}>
            <p className="font-semibold text-red-950">
              {CONFLICT_COPY[c.code]?.plain ?? c.code}
              <span className="ml-2 font-normal text-red-800">
                {c.sources.map((s) => SOURCE_TITLE[s] ?? s).join(' and ')}. Conflict {c.code}
              </span>
            </p>
            <p className="text-red-950">{c.sentence}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(c.values).map(([k, v]) => (
                <span key={k} className="rounded-md border border-red-200 bg-white px-2 py-0.5">
                  <span className="text-slate-600">{VALUE_LABELS[k] ?? k.replace(/_/g, ' ')}</span> <span className="font-bold">{sayValue(k, v)}</span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TrustSummary({ box }: { box: BoxDetail }) {
  return (
    <span className="flex flex-wrap gap-x-4">
      {SOURCE_NAMES.map((name) => {
        const s = box.sources[name]
        if (!s) return null
        const level = trustLevel(s.trust)
        return (
          <span key={name} className="whitespace-nowrap">
            {SOURCE_TITLE[name]} <span className={`font-semibold ${s.dark ? 'text-red-800' : level.text}`}>{s.dark ? 'Dark' : level.label}</span>
          </span>
        )
      })}
    </span>
  )
}

function SourcePanel({ name, box }: { name: SourceName; box: BoxDetail }) {
  const detail = box.sources[name]
  const inConflict = box.conflicts.filter((c) => c.sources.includes(name) && c.code !== 'C4')
  if (!detail) {
    return (
      <article className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <h4 className="text-lg font-bold">{SOURCE_TITLE[name]}</h4>
        <p className="mt-1 text-slate-600">{name === 'reefer' ? 'Not a reefer. No telemetry.' : 'No reading for this box.'}</p>
      </article>
    )
  }
  return (
    <article
      className={`flex flex-col gap-2 rounded-lg border bg-white p-3 ${detail.dark ? 'border-2 border-red-500' : inConflict.length ? 'border-2 border-red-300' : 'border-slate-200'}`}
      aria-label={`${SOURCE_TITLE[name]} source`}
    >
      <header className="flex flex-wrap items-center justify-between gap-1">
        <h4 className="text-lg font-bold">{SOURCE_TITLE[name]}</h4>
        {detail.badge && <BadgeChip kind={detail.badge} />}
        {sourceVia(name) && <p className="w-full text-slate-600">Via {sourceVia(name)}</p>}
      </header>
      <p className={detail.dark ? 'font-semibold text-red-800' : 'text-slate-600'}>{detail.dark ? `Dark. Last report ${detail.age} ago` : `Reported ${detail.age} ago`}</p>
      <TrustBar value={detail.trust} reason={detail.trust_reason} />
      {inConflict.length > 0 && <p className="font-semibold text-red-800">Disagrees with another source</p>}
      {detail.dark && <p className="text-slate-700">Last known values. Rung does not use them.</p>}
      <dl className={`flex flex-col gap-1 ${detail.dark ? 'opacity-60' : ''}`}>
        {SOURCE_FIELDS[name].map(([key, label, fmt]) => (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-2">
            <dt className="text-slate-600">{label}</dt>
            <dd className="ml-auto min-w-0 text-right font-semibold break-words">{fmt(detail.fields[key])}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

function silenceDetail(s: Silence): string {
  if (s.kind === 'tripped') {
    return `${s.peers.length} other units on circuit ${s.circuit} went silent within 10 minutes: ${s.peers.join(', ')}.`
  }
  if (s.kind === 'failed') {
    return s.alarm ? `Sent the alarm ${s.alarm}, then went silent.` : `Drew ${sayNum(s.draw_kw ?? 0)} kW before it went silent, outside the normal 2 to 8 kW band.`
  }
  const draw = s.draw_kw != null ? `Drew a normal ${sayNum(s.draw_kw)} kW before it went quiet.` : 'No draw reading before it went quiet.'
  const peers = s.peers.length ? `Only ${s.peers.join(' and ')} on circuit ${s.circuit} went silent with it.` : 'No other unit on its circuit went silent with it.'
  return `${draw} ${peers}`
}

function ReeferCard({ box }: { box: BoxDetail }) {
  const cargo = box.sources.reefer?.fields.cargo
  const showClock = box.mode === 'harbor_night' && box.warmup
  return (
    <section className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4" aria-label="Reefer">
      <div className="flex items-center gap-2">
        <Snowflake className="size-6 text-sky-700" aria-hidden />
        <div>
          <h3 className="text-lg font-bold">Reefer</h3>
          <p className="text-slate-700">{typeof cargo === 'string' ? cargo : 'Refrigerated cargo'}</p>
        </div>
      </div>
      {box.silence && <SilenceLine silence={box.silence} />}
      {showClock && <WarmupClock warmup={box.warmup!} />}
    </section>
  )
}

function SilenceLine({ silence }: { silence: Silence }) {
  return (
    <div className="max-w-xl" aria-label="Silent reefer">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold">Silent since {sayTime(silence.since)}</span>
        <span className="rounded bg-sky-700 px-1.5 font-semibold text-white">{silence.label}</span>
      </div>
      <p className="mt-1">{silenceDetail(silence)}</p>
    </div>
  )
}

function WarmupClock({ warmup }: { warmup: Warmup }) {
  if (warmup.power_on) {
    return (
      <div aria-label="Warm up clock">
        <p className="font-semibold">Warm up clock, scenario hours</p>
        <p>
          {warmup.silent_since
            ? `Silent since ${sayTime(warmup.silent_since)}. The last report showed the unit cooling, so the clock has not started.`
            : 'Power on. The clock is stopped.'}
        </p>
      </div>
    )
  }
  const passed = !(warmup.hours_left && warmup.hours_left > 0)
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-2" aria-label="Warm up clock">
      <div>
        <p className="font-semibold text-slate-700">Warm up clock, scenario hours</p>
        <p className="text-3xl font-bold tabular-nums">{sayHours(warmup.hours_off)}</p>
        <p>
          {warmup.cause === 'fault' ? 'Unit stopped cooling at' : 'Power off since'} {sayDateTime(warmup.off_since)}
        </p>
      </div>
      <div className="max-w-md">
        <p className={`text-xl font-bold ${passed ? 'text-red-800' : 'text-amber-900'}`}>
          {passed
            ? `Product passed ${sayNum(warmup.limit_c)} C at ${sayTime(warmup.limit_at)}.`
            : `Product reaches ${sayNum(warmup.limit_c)} C in ${sayHours(warmup.hours_left ?? 0)}, at ${sayTime(warmup.limit_at)}.`}
        </p>
        <p className="mt-1 text-slate-700">{warmup.note}</p>
      </div>
    </div>
  )
}

function History({ lines, onAudit }: { lines: AuditLine[]; onAudit: () => void }) {
  const latest = lines[0]
  const summary = latest
    ? `${lines.length} ${lines.length === 1 ? 'entry' : 'entries'}. Latest ${sayTime(latest.ts)}, ${(ACTOR[latest.actor] ?? ACTOR.engine).label} set ${STEP_META[latest.step].word}`
    : 'Nothing since the last reset'
  return (
    <Section title="Decision history" icon={<ScrollText className="size-5 text-slate-500" aria-hidden />} summary={summary} label="Decision history">
      <div className="flex justify-end">
        <Button variant="outline" onClick={onAudit}>
          Open in audit log
        </Button>
      </div>
      {lines.length === 0 ? (
        <p className="mt-1 text-slate-700">No decisions recorded for this box since the last reset.</p>
      ) : (
        <ol className="mt-2 flex flex-col divide-y divide-slate-200">
          {lines.map((line) => (
            <li key={line.seq} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
              <span className="w-28 shrink-0 font-semibold tabular-nums">{sayDateTime(line.ts)}</span>
              <span className={`w-28 shrink-0 font-semibold ${(ACTOR[line.actor] ?? ACTOR.engine).tone}`}>{(ACTOR[line.actor] ?? ACTOR.engine).label}</span>
              <span className="flex w-56 shrink-0 flex-wrap items-center gap-1.5">
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
    </Section>
  )
}
