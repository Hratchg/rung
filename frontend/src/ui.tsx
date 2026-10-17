import { useState, type ReactNode } from 'react'
import { ChevronDown, CircleCheck, Eye, Hand, Hourglass, Info, MessageCircleQuestionMark, OctagonPause, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SOURCE_NAMES, type AuditLine, type Badge, type SourceName, type Step } from './api'
import { LADDER, LADDER_RULES, STEP_META, trustLevel, urgencyLevel, URGENCY_HELP } from './copy'

export const STEP_ICON: Record<Step, LucideIcon> = {
  RELEASE: CircleCheck,
  WATCH: Eye,
  ASK: MessageCircleQuestionMark,
  SLOW: Hourglass,
  HOLD: OctagonPause,
  HAND: Hand,
}

const CHIP_SIZE = {
  md: 'gap-1.5 px-2 py-0.5 text-base [&_svg]:size-4',
  lg: 'gap-2 px-3 py-1 text-lg [&_svg]:size-5',
  xl: 'gap-2.5 px-4 py-1.5 text-2xl [&_svg]:size-7',
}

export function StepChip({ step, size = 'md' }: { step: Step; size?: keyof typeof CHIP_SIZE }) {
  const Icon = STEP_ICON[step]
  return (
    <span className={`inline-flex items-center rounded-md font-bold tracking-wide whitespace-nowrap ${STEP_META[step].chip} ${CHIP_SIZE[size]}`}>
      <Icon aria-hidden />
      {step}
    </span>
  )
}

/** The step chip with its plain meaning beside it. */
export function StepLabel({ step }: { step: Step }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <StepChip step={step} />
      <span className={`font-semibold ${STEP_META[step].text}`}>{STEP_META[step].short}</span>
    </span>
  )
}

export function NeedsYou() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 font-semibold whitespace-nowrap text-violet-900">
      <Hand className="size-4" aria-hidden />
      Needs you
    </span>
  )
}

export function Hint({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{text}</TooltipContent>
    </Tooltip>
  )
}

export function InfoHint({ text, label }: { text: string; label: string }) {
  return (
    <Hint text={text}>
      <button type="button" aria-label={label} className="inline-flex rounded-full text-slate-500 hover:text-slate-900">
        <Info className="size-4" aria-hidden />
      </button>
    </Hint>
  )
}

export function UrgencyMeter({ value, large = false }: { value: number; large?: boolean }) {
  const level = urgencyLevel(value)
  return (
    <div className="flex flex-col gap-1" aria-label={`Urgency ${value} of 100, ${level.label}`}>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-bold tabular-nums ${large ? 'text-2xl' : 'text-lg'}`}>{value}</span>
        <span className={`font-semibold ${level.text}`}>{level.label}</span>
      </div>
      <div className={`overflow-hidden rounded-full bg-slate-200 ${large ? 'h-2.5 w-28' : 'h-2 w-20'}`}>
        <div className={`h-full ${level.bar}`} style={{ width: `${Math.max(3, value)}%` }} />
      </div>
    </div>
  )
}

export function UrgencyHelp() {
  return <InfoHint text={URGENCY_HELP} label="What urgency means" />
}

export function TrustBar({ value, reason }: { value: number; reason: string }) {
  const level = trustLevel(value)
  return (
    <Hint text={reason}>
      <div tabIndex={0} className="flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-slate-400" aria-label={`Trust ${value.toFixed(2)}, ${level.label}. ${reason}`}>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`h-full ${level.bar} transition-[width] duration-200`} style={{ width: `${Math.round(value * 100)}%` }} />
        </div>
        <span className="font-bold tabular-nums">{value.toFixed(2)}</span>
        <span className={`font-semibold ${level.text}`}>{level.label}</span>
      </div>
    </Hint>
  )
}

export function BadgeChip({ kind }: { kind: 'live' | 'simulated' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 text-base whitespace-nowrap ${
        kind === 'live' ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-dashed border-slate-400 bg-white text-slate-700'
      }`}
    >
      <span className={`size-2.5 rounded-full ${kind === 'live' ? 'bg-emerald-600' : 'border border-slate-500'}`} />
      {kind === 'live' ? 'Live' : 'Simulated'}
    </span>
  )
}

const SHORT: Record<SourceName, string> = {
  carrier: 'Carrier',
  terminal: 'Terminal',
  customs: 'Customs',
  weighbridge: 'Scale',
  reefer: 'Reefer',
}

/** One badge per row. Mixed rows name the live sources. */
export function SourceBadges({ badges }: { badges: Record<SourceName, Badge> }) {
  const present = SOURCE_NAMES.filter((s) => badges[s])
  const live = present.filter((s) => badges[s] === 'live')
  const sim = present.filter((s) => badges[s] === 'simulated')
  const text = [live.length ? `Live: ${live.map((s) => SHORT[s]).join(', ')}` : '', sim.length ? `Simulated: ${sim.map((s) => SHORT[s]).join(', ')}` : '']
    .filter(Boolean)
    .join('. ')
  return (
    <Hint text={`${text}.`}>
      <span className="inline-flex flex-wrap gap-1" tabIndex={0}>
        {live.length > 0 && <BadgeChip kind="live" />}
        {sim.length > 0 && <BadgeChip kind="simulated" />}
      </span>
    </Hint>
  )
}

export function CallTags({ line }: { line: AuditLine }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className="rounded bg-sky-100 px-1.5 text-sky-900">
        Call <span className="font-mono">{line.call_id}</span>
      </span>
      <span className="rounded bg-slate-100 px-1.5 text-slate-900">Outcome {line.outcome ? line.outcome.replace(/_/g, ' ') : 'pending'}</span>
    </span>
  )
}

/** A card whose body opens on demand. The summary stays visible so nothing is hidden without a hint. */
export function Section({
  title,
  summary,
  icon,
  defaultOpen = false,
  tone = 'plain',
  children,
  label,
}: {
  title: string
  summary?: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  tone?: 'plain' | 'demo'
  children: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const shell = tone === 'demo' ? 'border-2 border-dashed border-fuchsia-400 bg-fuchsia-50/60' : 'border border-slate-200 bg-white shadow-sm'
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={`rounded-xl ${shell}`} aria-label={label ?? title}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50/70">
        {icon}
        <span className="text-lg font-bold">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-slate-600">{summary}</span>}
        <span className="ml-auto flex items-center gap-1 font-semibold text-slate-700">
          {open ? 'Hide' : 'Show'}
          <ChevronDown className={`size-5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** Where a step sits on the ladder. The current rung is filled, the rest are outlined. */
export function MiniLadder({ step }: { step: Step }) {
  return (
    <ol className="flex items-stretch gap-1" aria-label={`Ladder position: ${STEP_META[step].word}`}>
      {LADDER.map((s) => {
        const on = s === step
        const Icon = STEP_ICON[s]
        return (
          <li
            key={s}
            aria-current={on ? 'step' : undefined}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-base ${s === 'HAND' ? 'ml-2' : ''} ${
              on ? `${STEP_META[s].chip} border-transparent font-bold` : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {STEP_META[s].word}
          </li>
        )
      })}
    </ol>
  )
}

export function LadderHelp({ trigger }: { trigger?: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Info aria-hidden />
            How the ladder works
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>The ladder</DialogTitle>
          <DialogDescription>
            For every box, Rung picks the gentlest step that is still safe. Five steps run from Release to Hold. Hand sits above them for the cases a person must decide.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-1.5 pr-3 font-semibold">Step</th>
              <th className="py-1.5 pr-3 font-semibold">What happens at the gate</th>
              <th className="py-1.5 font-semibold">Who acts</th>
            </tr>
          </thead>
          <tbody>
            {LADDER.map((s) => (
              <tr key={s} className={`border-b border-slate-100 align-top ${s === 'HAND' ? 'bg-violet-50/60' : ''}`}>
                <td className="py-2 pr-3">
                  <StepChip step={s} />
                </td>
                <td className="py-2 pr-3">{STEP_META[s].meaning}</td>
                <td className="py-2 font-semibold whitespace-nowrap">{STEP_META[s].who}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-slate-700">
          {LADDER_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
