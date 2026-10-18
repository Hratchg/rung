import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAudit, type AuditLine, type Twist } from './api'
import { ACTOR } from './copy'
import { sayDateTime } from './format'
import { CallTags, StepChip } from './ui'

const AUDIT_LIMIT = 100

function sayWall(iso: string | null | undefined): string {
  if (!iso) return 'Not yet'
  return /(\+00:00|Z)$/.test(iso) ? `${sayDateTime(iso)} UTC` : sayDateTime(iso)
}

export function Drawer({
  title,
  description,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string
  description: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className={`w-full gap-0 bg-white ${wide ? 'data-[side=right]:sm:max-w-[960px]' : 'data-[side=right]:sm:max-w-[680px]'}`}>
        <SheetHeader className="border-b border-slate-200 pr-14">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function AuditPanel({ open, initialBox, onClose }: { open: boolean; initialBox: string; onClose: () => void }) {
  const [box, setBox] = useState(initialBox)
  const filter = box.trim().toUpperCase()
  const audit = useAudit({ box: filter, limit: AUDIT_LIMIT }, open)
  const lines = audit.data?.lines
  return (
    <Drawer title="Audit log" description="Every step change, planner action, call, and spoof, newest first, with the reason in plain sentences." open={open} onClose={onClose}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="text-slate-600">Filter by box</span>
          <input
            className="h-10 w-56 rounded-lg border border-slate-300 px-2 font-mono text-base uppercase"
            value={box}
            onChange={(e) => setBox(e.target.value)}
            placeholder="Box number"
            aria-label="Filter by box number"
          />
        </label>
        {box && (
          <Button variant="outline" onClick={() => setBox('')}>
            Show all boxes
          </Button>
        )}
        {audit.data && (
          <p className="pb-2 text-slate-600">
            Showing {lines!.length} of {filter ? 'the matching' : audit.data.total} lines.
          </p>
        )}
      </div>
      {audit.isError && !lines && <p className="mt-3 rounded-lg bg-red-50 p-3 text-red-900">Cannot reach the audit log. Retrying every 2 seconds.</p>}
      {audit.isPending && <p className="mt-3 text-slate-700">Loading the audit log</p>}
      {lines && lines.length === 0 && (
        <p className="mt-3 rounded-lg border border-slate-200 p-4 text-slate-700">
          {filter ? `No audit lines for a box matching ${filter}.` : 'No audit lines since the last reset.'}
        </p>
      )}
      {lines && lines.length > 0 && (
        <ol className="mt-3 flex flex-col divide-y divide-slate-200" data-demo="audit-lines">
          {lines.map((line) => (
            <AuditItem key={line.seq} line={line} />
          ))}
        </ol>
      )}
    </Drawer>
  )
}

function AuditItem({ line }: { line: AuditLine }) {
  const [open, setOpen] = useState(false)
  const actor = ACTOR[line.actor] ?? ACTOR.engine
  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold tabular-nums">{sayDateTime(line.ts)}</span>
        <a href={`#/box/${line.box}`} className="font-mono font-semibold text-sky-900 underline underline-offset-4">
          {line.box}
        </a>
        <span className={`font-semibold ${actor.tone}`}>{actor.label}</span>
        <span className="text-slate-600">set</span>
        <StepChip step={line.step} />
        {line.previous_step && line.previous_step !== line.step && <span className="text-slate-600">was {line.previous_step}</span>}
        {line.override && <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-900">Override</span>}
        {line.twist_tag && <span className="rounded bg-fuchsia-100 px-1.5 font-semibold text-fuchsia-900">Twist {line.twist_tag}</span>}
      </div>
      {line.call_id && (
        <div className="mt-1">
          <CallTags line={line} />
        </div>
      )}
      {line.note && <div className="mt-0.5 font-semibold">Note: {line.note}</div>}
      {line.effect && <div className="mt-0.5">{line.effect}</div>}
      <button type="button" onClick={() => setOpen(!open)} className={`mt-0.5 text-left text-slate-800 ${open ? '' : 'line-clamp-2'}`} title={open ? 'Show less' : 'Show the full reason'}>
        {line.reason}
      </button>
      <div className="mt-0.5 text-slate-500">
        Urgency {line.urgency}. Rules {line.fired.length ? line.fired.join(', ') : 'none'}. Conflicts {line.conflicts.length ? line.conflicts.join(', ') : 'none'}.
        {line.owner ? ` Owner: ${line.owner}.` : ''}
        {line.hand ? ' Needs a planner.' : ''}
      </div>
    </li>
  )
}

export function TwistPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const audit = useAudit({ box: '', limit: 1, diff: true }, open)
  const twists = audit.data?.twists
  return (
    <Drawer
      title="Twist log"
      description="Hackathon twists. Rung answers each one with one new rule file, event type, or source."
      open={open}
      onClose={onClose}
      wide
    >
      {audit.isError && !twists && <p className="rounded-lg bg-red-50 p-3 text-red-900">Cannot reach the twist log. Retrying every 2 seconds.</p>}
      {audit.isPending && <p className="text-slate-700">Loading the twist log</p>}
      {twists && twists.length === 0 && (
        <p className="rounded-lg border border-slate-200 p-4 text-slate-700">No twists yet. The scripted twist arrives at plus 01:00 on the scenario clock.</p>
      )}
      {twists && twists.length > 0 && (
        <ol className="flex flex-col gap-3">
          {twists.map((t) => (
            <TwistItem key={t.tag} twist={t} />
          ))}
        </ol>
      )}
    </Drawer>
  )
}

function TwistItem({ twist }: { twist: Twist }) {
  const merged = twist.status === 'merged'
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-fuchsia-100 px-2 py-0.5 font-mono text-lg font-bold text-fuchsia-900">{twist.tag}</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${merged ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
          {merged ? 'Merged' : 'Received, nothing added yet'}
        </span>
      </div>
      {twist.text && <p className="mt-2 text-lg">{twist.text}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-600">Received</dt>
        <dd className="font-semibold">{twist.received_at ? `${sayDateTime(twist.received_at)} scenario time` : sayWall(twist.received_wall)}</dd>
        <dt className="text-slate-600">Merged</dt>
        <dd className="font-semibold">{sayWall(twist.merged_at)}</dd>
        <dt className="text-slate-600">Added</dt>
        <dd>
          {twist.added.length === 0 ? (
            <span className="text-slate-700">Nothing yet</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {twist.added.map((a) => (
                <li key={a.file}>
                  {a.id && <span className="mr-1 rounded bg-slate-200 px-1.5 font-mono font-bold">{a.id}</span>}
                  {a.name && <span className="mr-1 font-semibold">{a.name}</span>}
                  <span className="font-mono text-slate-700">{a.file}</span>
                  {a.created_at && <span className="text-slate-600">. Created {sayWall(a.created_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <GitDiff twist={twist} />
    </li>
  )
}

function diffLineClass(line: string): string {
  if (line.startsWith('diff --git')) return 'mt-2 bg-slate-800 font-bold text-white'
  if (line.startsWith('+++') || line.startsWith('---')) return 'font-semibold text-slate-700'
  if (line.startsWith('@@')) return 'bg-sky-50 text-sky-900'
  if (line.startsWith('+')) return 'bg-emerald-50 text-emerald-900'
  if (line.startsWith('-')) return 'bg-red-50 text-red-900'
  return 'text-slate-800'
}

function Patch({ patch }: { patch: string }) {
  const lines = patch.replace(/\n$/, '').split('\n')
  return (
    <pre className="mt-2 max-h-[480px] overflow-auto rounded-lg border border-slate-300 bg-white py-1 font-mono text-base leading-6">
      {lines.map((line, i) => (
        <div key={i} className={`px-2 whitespace-pre ${diffLineClass(line)}`}>
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}

function GitDiff({ twist }: { twist: Twist }) {
  const { available, commits } = twist.git
  return (
    <section className="mt-3 border-t border-slate-200 pt-2" aria-label={`Git diff for ${twist.tag}`}>
      <h4 className="font-bold">Git diff</h4>
      {!available && <p className="text-slate-700">This copy of Rung has no git repo, so there is no diff to show.</p>}
      {available && commits.length === 0 && (
        <p className="text-slate-700">
          No commit with the message <span className="font-mono">twist: {twist.tag}</span> and no git tag named {twist.tag} yet.
        </p>
      )}
      {commits.map((c) => (
        <details key={c.sha} open={commits.length === 1} className="mt-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer">
            <span className="mr-2 rounded bg-slate-800 px-1.5 font-mono font-bold text-white">{c.short}</span>
            <span className="mr-2 font-semibold">{c.subject}</span>
            <span className="text-slate-600">
              {sayWall(c.date)}
              {c.via === 'git tag' ? '. Found by git tag' : ''}
            </span>
          </summary>
          <ul className="mt-1 flex flex-col">
            {c.files.map((f) => (
              <li key={f.path} className="flex flex-wrap gap-x-3">
                <span className="font-mono">{f.path}</span>
                <span className="font-semibold text-emerald-800">{f.added == null ? 'binary' : `plus ${f.added}`}</span>
                {f.deleted != null && <span className="font-semibold text-red-800">minus {f.deleted}</span>}
              </li>
            ))}
          </ul>
          {c.patch && <Patch patch={c.patch} />}
          {c.truncated && <p className="mt-1 text-slate-700">Diff cut short for the panel. Run git show {c.short} for the rest.</p>}
        </details>
      ))}
    </section>
  )
}
