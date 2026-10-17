import type { ReactNode } from 'react'
import { SOURCE_NAMES, type AuditLine, type Badge, type SourceName, type Step } from './api'
import { STEP_META, trustLevel } from './format'

export function StepChip({ step, size = 'md' }: { step: Step; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md font-bold tracking-wide ${STEP_META[step].chip} ${
        size === 'lg' ? 'px-3 py-1 text-lg' : 'px-2 py-0.5 text-base'
      }`}
    >
      {step}
    </span>
  )
}

export function CallTags({ line }: { line: AuditLine }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className="rounded bg-sky-100 px-1.5 font-mono text-sky-900">Call {line.call_id}</span>
      <span className="rounded bg-slate-100 px-1.5 font-mono text-slate-900">Outcome {line.outcome ?? 'pending'}</span>
    </span>
  )
}

export function UrgencyBar({ value }: { value: number }) {
  const tone = value >= 70 ? 'bg-red-600' : value >= 40 ? 'bg-amber-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-2" aria-label={`Urgency ${value} of 100`}>
      <div className="h-3 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(3, value)}%` }} />
      </div>
      <span className="w-8 text-right text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function TrustBar({ value, reason }: { value: number; reason: string }) {
  const level = trustLevel(value)
  return (
    <div className="group relative" tabIndex={0} aria-label={`Trust ${value.toFixed(2)}, ${level.label}. ${reason}`}>
      <div className="flex items-center gap-2">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full ${level.bar} transition-[width] duration-200`} style={{ width: `${Math.round(value * 100)}%` }} />
        </div>
        <span className="text-lg font-bold tabular-nums">{value.toFixed(2)}</span>
        <span className={`font-semibold ${level.text}`}>{level.label}</span>
      </div>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-72 rounded-md bg-slate-900 px-3 py-2 text-base text-white shadow-lg group-hover:block group-focus:block"
      >
        {reason}
      </div>
    </div>
  )
}

const SHORT: Record<SourceName, string> = {
  carrier: 'Carrier',
  terminal: 'Terminal',
  customs: 'Customs',
  weighbridge: 'Scale',
  reefer: 'Reefer',
}

export function BadgeChip({ kind, children }: { kind: 'live' | 'simulated'; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 text-base ${
        kind === 'live' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-dashed border-slate-400 bg-white text-slate-700'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${kind === 'live' ? 'bg-emerald-600' : 'border border-slate-500'}`} />
      {kind === 'live' ? 'Live' : 'Simulated'}
      {children}
    </span>
  )
}

export function SourceBadges({ badges }: { badges: Record<SourceName, Badge> }) {
  const present = SOURCE_NAMES.filter((s) => badges[s])
  const live = present.filter((s) => badges[s] === 'live')
  const sim = present.filter((s) => badges[s] === 'simulated')
  return (
    <div className="flex flex-col items-start gap-1">
      {live.length > 0 && (
        <>
          <BadgeChip kind="live" />
          <span className="text-emerald-900">{live.map((s) => SHORT[s]).join(', ')}</span>
        </>
      )}
      {sim.length > 0 && (
        <>
          <BadgeChip kind="simulated" />
          <span className="text-slate-600">{sim.length === present.length ? `All ${sim.length} sources` : sim.map((s) => SHORT[s]).join(', ')}</span>
        </>
      )}
    </div>
  )
}
