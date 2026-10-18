import { Bot, PhoneCall, Wrench } from 'lucide-react'
import { usePrompts } from './api'
import { Drawer } from './Audit'
import { PROMPT_COPY } from './copy'
import { promptBlocks, promptParts, type PromptBlock } from './promptText'

function Rich({ text }: { text: string }) {
  return (
    <>
      {promptParts(text).map((p, i) =>
        p.kind === 'variable' ? (
          <span key={i} className="rounded bg-sky-100 px-1 font-mono text-[0.95em] text-sky-900">
            {p.text}
          </span>
        ) : p.kind === 'term' ? (
          <strong key={i} className="font-mono text-[0.95em] text-slate-900">
            {p.text}
          </strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function Block({ block: b }: { block: PromptBlock }) {
  if (b.kind === 'step') {
    return (
      <p className="flex gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-800 font-bold text-white">{b.n}</span>
        <span>
          <Rich text={b.text} />
        </span>
      </p>
    )
  }
  if (b.kind === 'bullet') {
    return (
      <p className="ml-9 border-l-4 border-slate-300 pl-3">
        <Rich text={b.text} />
      </p>
    )
  }
  return (
    <p>
      <Rich text={b.text} />
    </p>
  )
}

function PromptBody({ prompt }: { prompt: string }) {
  const sections: { title: string; blocks: PromptBlock[] }[] = []
  for (const b of promptBlocks(prompt)) {
    if (b.kind === 'heading') sections.push({ title: b.text, blocks: [] })
    else if (sections.length === 0) sections.push({ title: '', blocks: [b] })
    else sections[sections.length - 1].blocks.push(b)
  }
  return (
    <div className="flex flex-col gap-5 leading-relaxed">
      {sections.map((s, i) => (
        <section key={i} data-demo={`prompt-${slug(s.title)}`} className="flex flex-col gap-2">
          {s.title && <h3 className="border-b border-slate-200 pb-1 text-lg font-bold text-slate-900">{s.title}</h3>}
          {s.blocks.map((b, j) => (
            <Block key={j} block={b} />
          ))}
        </section>
      ))}
    </div>
  )
}

function Side({ title, icon: Icon, items }: { title: string; icon: typeof Bot; items: { name: string; text: string }[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-demo={`prompt-${slug(title)}`}>
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <Icon className="size-5" aria-hidden />
        {title}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.name}>
            <span className="font-mono font-semibold text-slate-900">{it.name}</span>
            {it.text && <span className="block text-slate-600">{it.text}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PromptPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prompts = usePrompts(open)
  const r = prompts.data?.retell
  return (
    <Drawer title={PROMPT_COPY.title} description={PROMPT_COPY.description} open={open} onClose={onClose} wide>
      {prompts.isPending && <p className="text-slate-600">Loading the prompt</p>}
      {prompts.error && <p className="rounded-lg bg-red-100 px-3 py-2 text-red-900">Could not load the prompt. {prompts.error.message}</p>}
      {r && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-slate-900 px-2 py-0.5 font-bold text-white">Retell AI</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              Agent <strong>{r.agent_name}</strong>
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5">Temperature {r.temperature}</span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5">
              Source <span className="font-mono">{r.source}</span>
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <article aria-label="Retell agent prompt" className="rounded-xl border border-slate-200 bg-white p-4">
              <PromptBody prompt={r.prompt} />
              <p className="mt-4 text-slate-600">{r.functions_live ? PROMPT_COPY.functionsLive : PROMPT_COPY.functionsOff}</p>
            </article>
            <div className="flex flex-col gap-3">
              <Side title="Filled in for each call" icon={PhoneCall} items={r.variables.map((v) => ({ name: v, text: '' }))} />
              <Side title="Tools the agent can use" icon={Wrench} items={r.tools.map((t) => ({ name: t.name, text: t.description }))} />
              <Side title="Read back after the call" icon={Bot} items={r.analysis.map((a) => ({ name: a.name, text: PROMPT_COPY.analysis[a.name] ?? '' }))} />
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
