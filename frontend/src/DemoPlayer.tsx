import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { post } from './api'
import { LADDER } from './copy'
import { DEMO_CHAPTERS, DEMO_CLOSING, DEMO_TITLE, DEMO_TOTAL, type DemoAction, type DemoCard } from './demoScript'
import { prepareDemo } from './demoStart'
import { StepChip } from './ui'

export type DemoPanel = { kind: 'audit'; box: string } | { kind: 'prompt' } | null

type Rect = { x: number; y: number; w: number; h: number }

const HOME_REGION = 'los_angeles'
// Space kept clear above the lower third, so a spotlit element is never under the caption.
const CAPTION_SPACE = 200
const WAIT_MS = 2000
const CHAPTER_COUNT = DEMO_CHAPTERS.length - 2

function find(target: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-demo="${target}"]`)
  return el && el.getClientRects().length > 0 ? el : null
}

async function waitFor(target: string, alive: () => boolean): Promise<HTMLElement | null> {
  const until = performance.now() + WAIT_MS
  while (alive() && performance.now() < until) {
    const el = find(target)
    if (el) return el
    await new Promise((r) => setTimeout(r, 50))
  }
  return null
}

/** Radix focuses the first control in a drawer it opens, and selects an input's text. On a recording that reads as a stray highlight. */
async function blurDrawer(alive: () => boolean): Promise<void> {
  const until = performance.now() + WAIT_MS
  while (alive() && performance.now() < until) {
    const el = document.activeElement
    if (el instanceof HTMLElement && el.closest('[role="dialog"]')) {
      el.blur()
      return
    }
    await new Promise((r) => setTimeout(r, 30))
  }
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY
    if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

function reveal(el: HTMLElement): void {
  if (el.closest('[data-demo="app-header"]')) return
  const r = el.getBoundingClientRect()
  const box = scrollParent(el)
  if (box) {
    const b = box.getBoundingClientRect()
    if (r.top >= b.top + 8 && r.bottom <= Math.min(b.bottom, window.innerHeight - CAPTION_SPACE)) return
    box.scrollTo({ top: box.scrollTop + r.top - b.top - 16, behavior: 'smooth' })
    return
  }
  const top = (find('app-header')?.getBoundingClientRect().bottom ?? 0) + 12
  const bottom = window.innerHeight - CAPTION_SPACE
  if (r.top >= top && r.bottom <= bottom) return
  const room = bottom - top
  window.scrollBy({ top: r.height < room ? r.top - top - (room - r.height) / 2 : r.top - top, behavior: 'smooth' })
}

function press(el: HTMLElement): void {
  const target = el.matches('a, button') ? el : el.querySelector<HTMLElement>('a, button')
  if (!target) return
  // Radix tabs switch on mousedown, plain buttons and links on click.
  const init = { bubbles: true, cancelable: true, button: 0 }
  target.dispatchEvent(new MouseEvent('mousedown', init))
  target.dispatchEvent(new MouseEvent('mouseup', init))
  target.click()
}

function go(hash: string): void {
  if (window.location.hash !== hash) window.location.hash = hash
}

function ringRect(el: HTMLElement): Rect | null {
  const r = el.getBoundingClientRect()
  const pad = 8
  const x0 = Math.max(6, r.left - pad)
  const y0 = Math.max(6, r.top - pad)
  const x1 = Math.min(window.innerWidth - 6, r.right + pad)
  const y1 = Math.min(window.innerHeight - 6, r.bottom + pad)
  return x1 - x0 > 12 && y1 - y0 > 12 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

const ease = (a: Rect, b: Rect, k: number): Rect => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k })

/** Dims the page and rings one element. It follows the element every frame, so scrolling and layout shifts carry it along. */
function Spotlight({ target }: { target: string | null }) {
  const ring = useRef<HTMLDivElement>(null)
  const wanted = useRef(target)
  useEffect(() => {
    wanted.current = target
  }, [target])
  useEffect(() => {
    let raf = 0
    let at: Rect | null = null
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const node = ring.current
      if (!node) return
      const el = wanted.current ? find(wanted.current) : null
      const want = el ? ringRect(el) : null
      if (!want) {
        node.style.opacity = '0'
        at = null
        return
      }
      at = at ? ease(at, want, 0.2) : want
      node.style.opacity = '1'
      node.style.transform = `translate(${at.x}px, ${at.y}px)`
      node.style.width = `${at.w}px`
      node.style.height = `${at.h}px`
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div
      ref={ring}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[60] rounded-xl opacity-0 shadow-[0_0_0_4px_rgb(251_191_36),0_0_28px_8px_rgb(251_191_36/0.45),0_0_0_200vmax_rgb(2_6_23/0.58)] transition-opacity duration-300"
    />
  )
}

function Caption({ index }: { index: number }) {
  const c = DEMO_CHAPTERS[index]
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[70] mx-auto flex w-[min(1180px,calc(100vw-3rem))] animate-in items-center gap-5 rounded-2xl bg-zinc-950/92 px-6 py-4 text-white shadow-2xl ring-1 ring-white/15 duration-500 fade-in slide-in-from-bottom-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-2xl font-black text-zinc-950 tabular-nums">{index}</span>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold tracking-tight">{c.title}</p>
        <p className="text-xl text-zinc-200">{c.caption}</p>
      </div>
      <span className="shrink-0 self-end text-sm text-zinc-400">
        {index} of {CHAPTER_COUNT}. Esc stops the demo
      </span>
    </div>
  )
}

function TitleCard({ shown }: { shown: boolean }) {
  return (
    <div
      aria-hidden={!shown}
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-[radial-gradient(ellipse_at_top,#1e1b4b,#020617_72%)] text-white transition-opacity duration-700 ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="flex max-w-5xl flex-col items-center gap-6 px-8 text-center">
        <p className="text-xl font-semibold tracking-[0.3em] text-amber-300 uppercase">{DEMO_TITLE.kicker}</p>
        <h1 className="text-[9rem] leading-none font-black tracking-tight">{DEMO_TITLE.title}</h1>
        <p className="text-4xl font-semibold text-zinc-100">{DEMO_TITLE.subtitle}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {LADDER.map((s) => (
            <StepChip key={s} step={s} size="lg" />
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2 text-2xl leading-snug text-zinc-200">
          {DEMO_TITLE.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <p className="text-lg text-zinc-400">{DEMO_TITLE.footer}</p>
      </div>
    </div>
  )
}

function ClosingCard({ shown, onClose }: { shown: boolean; onClose: () => void }) {
  return (
    <div
      aria-hidden={!shown}
      className={`fixed inset-0 z-[80] flex cursor-none items-center justify-center bg-[radial-gradient(ellipse_at_top,#1e1b4b,#020617_72%)] text-white transition-opacity duration-700 ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="flex max-w-5xl flex-col items-center gap-7 px-8 text-center">
        <p className="text-6xl font-black tracking-tight">{DEMO_CLOSING.title}</p>
        <p className="max-w-4xl text-2xl leading-snug text-zinc-200">{DEMO_CLOSING.subtitle}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-left text-2xl">
          {DEMO_CLOSING.rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold text-amber-300">{label}</dt>
              <dd className="text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[5rem] leading-none font-black tracking-tight">Rung</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-lg text-zinc-300 ring-1 ring-white/20 hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" aria-hidden />
        Close
      </button>
    </div>
  )
}

/**
 * Plays DEMO_CHAPTERS on the wall clock. Actions run in order on one promise chain, so an API call
 * that lands late delays the next action instead of overtaking it.
 */
export default function DemoPlayer({ setPanel, onStop }: { setPanel: (p: DemoPanel) => void; onStop: () => void }) {
  const qc = useQueryClient()
  const [chapter, setChapter] = useState(0)
  const [card, setCard] = useState<DemoCard | null>('title')
  const [spot, setSpot] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const stopped = useRef(false)
  const stopRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    // The page still scrolls. A recording just does not show the scrollbar.
    const root = document.documentElement
    root.style.setProperty('scrollbar-width', 'none')
    return () => {
      root.style.removeProperty('scrollbar-width')
    }
  }, [])

  useEffect(() => {
    alive.current = true
    const isAlive = () => alive.current
    const refresh = () => qc.invalidateQueries()
    const steps = DEMO_CHAPTERS.flatMap((c) => c.actions.map((a) => ({ action: a, time: c.start + a.at }))).sort((a, b) => a.time - b.time)

    async function perform(a: DemoAction) {
      switch (a.do) {
        case 'setup':
          await post('/api/scenario/speed', { minutes_per_second: 0 })
          await post('/api/scenario/reset', {})
          await post('/api/region', { region: HOME_REGION })
          prepareDemo()
          setPanel(null)
          go('#/')
          window.scrollTo(0, 0)
          await refresh()
          return
        case 'card':
          setCard(a.card)
          return
        case 'route':
          go(a.hash)
          return
        case 'spot':
          setSpot(a.target)
          if (a.target && a.scroll !== 'none') void waitFor(a.target, isAlive).then((el) => el && isAlive() && reveal(el))
          return
        case 'click': {
          const el = await waitFor(a.target, isAlive)
          if (el && isAlive()) press(el)
          return
        }
        case 'post':
          await post(a.path, a.body)
          await refresh()
          return
        case 'panel':
          setPanel(a.panel === 'audit' ? { kind: 'audit', box: a.box } : a.panel === 'prompt' ? { kind: 'prompt' } : null)
          if (a.panel) void blurDrawer(isAlive)
          return
      }
    }

    const started = performance.now()
    let next = 0
    const tick = () => {
      if (!alive.current) return
      const t = (performance.now() - started) / 1000
      while (next < steps.length && steps[next].time <= t) {
        const { action } = steps[next++]
        chain.current = chain.current.then(() => (alive.current ? perform(action) : undefined)).catch((e) => console.warn('Demo step failed', action, e))
      }
      setChapter(Math.max(0, DEMO_CHAPTERS.findLastIndex((c) => c.start <= t)))
      if (bar.current) bar.current.style.width = `${Math.min(100, (100 * t) / DEMO_TOTAL)}%`
      if (t >= DEMO_TOTAL) window.clearInterval(timer)
    }
    const timer = window.setInterval(tick, 50)
    tick()
    return () => {
      alive.current = false
      window.clearInterval(timer)
    }
  }, [qc, setPanel])

  useEffect(() => {
    const stop = () => {
      if (stopped.current) return
      stopped.current = true
      alive.current = false
      setPanel(null)
      const url = new URL(window.location.href)
      if (url.searchParams.has('demo')) {
        url.searchParams.delete('demo')
        window.history.replaceState(null, '', url)
      }
      void chain.current
        .then(() => post('/api/region', { region: HOME_REGION }))
        .catch(() => undefined)
        .finally(() => qc.invalidateQueries())
      onStop()
    }
    stopRef.current = stop
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qc, setPanel, onStop])

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-[55] cursor-none" />
      <Spotlight target={card ? null : spot} />
      {!card && chapter > 0 && <Caption key={chapter} index={chapter} />}
      <TitleCard shown={card === 'title'} />
      <ClosingCard shown={card === 'closing'} onClose={() => stopRef.current()} />
      <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] h-1.5 bg-white/10">
        <div ref={bar} className="h-full w-0 bg-amber-400" />
      </div>
    </>
  )
}
