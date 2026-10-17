import { useEffect, useState, type ReactNode } from 'react'
import { useAudit, type AuditLine, type Twist } from './api'
import { sayDateTime } from './format'
import { StepChip } from './ui'

const AUDIT_LIMIT = 100

function sayWall(iso: string | null | undefined): string {
  if (!iso) return 'Not yet'
  return /(\+00:00|Z)$/.test(iso) ? `${sayDateTime(iso)} UTC` : sayDateTime(iso)
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-full w-full max-w-[640px] flex-col bg-white text-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded border border-slate-400 px-3 py-1 font-semibold hover:bg-slate-100">
            Close
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </aside>
    </div>
  )
}

export function AuditPanel({ initialBox, onClose }: { initialBox: string; onClose: () => void }) {
  const [box, setBox] = useState(initialBox)
  const filter = box.trim().toUpperCase()
  const audit = useAudit({ box: filter, limit: AUDIT_LIMIT })
  const lines = audit.data?.lines
  return (
    <Drawer title="Audit log" onClose={onClose}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="text-base text-slate-600">Filter by box</span>
          <input
            className="w-56 rounded border border-slate-300 px-2 py-1 font-mono text-base uppercase"
            value={box}
            onChange={(e) => setBox(e.target.value)}
            placeholder="Box number"
            aria-label="Filter by box number"
          />
        </label>
        {box && (
          <button type="button" onClick={() => setBox('')} className="rounded border border-slate-400 px-3 py-1 font-semibold hover:bg-slate-100">
            Show all boxes
          </button>
        )}
        {audit.data && (
          <p className="pb-1 text-slate-600">
            Newest first. Showing {lines!.length} of {filter ? 'the matching' : audit.data.total} lines.
          </p>
        )}
      </div>
      {audit.isError && !lines && <p className="mt-3 rounded bg-red-50 p-3 text-red-900">Cannot reach the audit log. Retrying every 2 seconds.</p>}
      {audit.isPending && <p className="mt-3 text-slate-700">Loading the audit log</p>}
      {lines && lines.length === 0 && (
        <p className="mt-3 rounded border border-slate-200 p-4 text-slate-700">
          {filter ? `No audit lines for a box matching ${filter}.` : 'No audit lines since the last reset.'}
        </p>
      )}
      {lines && lines.length > 0 && (
        <ol className="mt-3 flex flex-col divide-y divide-slate-200">
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
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold tabular-nums">{sayDateTime(line.ts)}</span>
        <a href={`#/box/${line.box}`} className="font-mono font-semibold text-sky-900 underline underline-offset-4">
          {line.box}
        </a>
        <span className={`font-semibold ${line.actor === 'planner' ? 'text-violet-800' : 'text-slate-700'}`}>
          {line.actor === 'planner' ? 'Planner' : 'Engine'}
        </span>
        <StepChip step={line.step} />
        {line.previous_step && line.previous_step !== line.step && <span className="text-slate-600">was {line.previous_step}</span>}
        {line.override && <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-900">Override true</span>}
        {line.hand && <span className="text-violet-900">Hand</span>}
        {line.twist_tag && <span className="rounded bg-fuchsia-100 px-1.5 font-semibold text-fuchsia-900">Twist {line.twist_tag}</span>}
      </div>
      <div className="mt-0.5 text-slate-700">
        Urgency {line.urgency}. Fired {line.fired.length ? line.fired.join(', ') : 'none'}. Conflicts {line.conflicts.length ? line.conflicts.join(', ') : 'none'}.
        {line.owner ? ` Owner: ${line.owner}.` : ''}
      </div>
      {line.note && <div className="font-semibold">Note: {line.note}</div>}
      {line.effect && <div>{line.effect}</div>}
      <button type="button" onClick={() => setOpen(!open)} className={`mt-0.5 text-left text-slate-800 ${open ? '' : 'line-clamp-2'}`}>
        {line.reason}
      </button>
    </li>
  )
}

export function TwistPanel({ onClose }: { onClose: () => void }) {
  const audit = useAudit({ box: '', limit: 1 })
  const twists = audit.data?.twists
  return (
    <Drawer title="Twist log" onClose={onClose}>
      <p className="text-slate-700">
        A twist arrives as a scenario event or a pasted message. Rung answers each one with one new rule file, event type, or source.
      </p>
      {audit.isError && !twists && <p className="mt-3 rounded bg-red-50 p-3 text-red-900">Cannot reach the twist log. Retrying every 2 seconds.</p>}
      {audit.isPending && <p className="mt-3 text-slate-700">Loading the twist log</p>}
      {twists && twists.length === 0 && (
        <p className="mt-3 rounded border border-slate-200 p-4 text-slate-700">
          No twists yet. The scripted twist arrives at plus 01:00 on the scenario clock.
        </p>
      )}
      {twists && twists.length > 0 && (
        <ol className="mt-3 flex flex-col gap-3">
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
    <li className="rounded-lg border border-slate-300 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-fuchsia-100 px-2 py-0.5 font-mono text-lg font-bold text-fuchsia-900">{twist.tag}</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${merged ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
          {merged ? 'Merged' : 'Received, nothing added yet'}
        </span>
      </div>
      {twist.text && <p className="mt-2 text-lg">{twist.text}</p>}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-600">Received</dt>
        <dd className="font-semibold">
          {twist.received_at ? `${sayDateTime(twist.received_at)} scenario time` : sayWall(twist.received_wall)}
        </dd>
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
    </li>
  )
}
