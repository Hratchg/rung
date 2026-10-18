// Pure data with no imports, so scripts/demo-script.ts can load it under plain Node to write the docs.

export type DemoCard = 'title' | 'closing'

export type DemoAction =
  | { at: number; do: 'setup' }
  | { at: number; do: 'card'; card: DemoCard | null }
  | { at: number; do: 'route'; hash: string }
  | { at: number; do: 'spot'; target: string | null; scroll?: 'auto' | 'none' }
  | { at: number; do: 'click'; target: string }
  | { at: number; do: 'post'; path: string; body: Record<string, unknown> }
  | { at: number; do: 'panel'; panel: 'prompt' | null }
  | { at: number; do: 'panel'; panel: 'audit'; box: string }

export type DemoChapter = {
  /** Seconds from the start of the demo. */
  start: number
  title: string
  /** One short line for the lower third. */
  caption: string
  /** What the viewer sees, for the script. */
  screen: string
  narration: string
  /** Each action runs at chapter start plus at seconds. */
  actions: DemoAction[]
}

export const DEMO_TOTAL = 166

export const WORDS_PER_SECOND = 2.7

export const WEIGHT_BOX = 'CMAU9939083'
export const REEFER_BOX = 'MSKU1234567'

export const DEMO_TITLE = {
  kicker: 'Hackathon demo',
  title: 'Rung',
  subtitle: 'Gate triage for a container terminal',
  lines: [
    'Five systems describe every box at the gate, and they disagree all the time.',
    'On a bad night the terminal closes the gate, and every truck in line waits, pays, and idles.',
  ],
  footer: 'Pier 7 is a simulated terminal on a scripted night, so this demo runs the same every time.',
}

export const DEMO_CLOSING = {
  title: 'Rules decide. People sign.',
  subtitle: 'Rung keeps the gate open on the worst night of the year and hands a planner only what needs a person.',
  rows: [
    ['Theme', 'Fewer delays, lower costs, and less truck idling at the gate'],
    ['Built with', 'Retell AI voice agent, Terminal49 data model, FastAPI, React, SciPy'],
    ['Funding path', 'NSF SBIR Phase I'],
    ['Global', 'Region profiles for Los Angeles, Rotterdam, and Shanghai'],
  ] as [string, string][],
}

const jump = (t: string) => ({ do: 'post' as const, path: '/api/scenario/jump', body: { t } })

const region = (id: string) => ({ do: 'post' as const, path: '/api/region', body: { region: id } })

export const DEMO_CHAPTERS: DemoChapter[] = [
  {
    start: 0,
    title: 'The problem',
    caption: 'Five systems describe every box, and they disagree.',
    screen: 'Title card: Rung, gate triage for a container terminal.',
    narration:
      'Every truck leaving a container terminal passes a gate. Five systems describe each box, and they often disagree. On a bad night the gate closes, and every truck in line pays in delay, fees, and idling diesel.',
    actions: [
      { at: 0, do: 'card', card: 'title' },
      { at: 0, do: 'setup' },
      { at: 14.4, do: 'card', card: null },
    ],
  },
  {
    start: 15,
    title: 'Everyday mode',
    caption: 'Tuesday 22:00. 191 boxes, 173 on Release, 34 need a planner.',
    screen: 'The Queue in Everyday mode: the summary bar, the headline, and the ladder from Release to Hand.',
    narration:
      'This is Rung at Pier 7, on an ordinary Tuesday. 191 boxes wait. Rung reads five sources per box and puts each on the gentlest safe step of this ladder, from Release to Hand, where a person decides. 34 need a planner.',
    actions: [
      { at: 0, do: 'spot', target: 'everyday-bar' },
      { at: 3.6, do: 'spot', target: 'queue-headline' },
      { at: 5.6, do: 'spot', target: 'ladder' },
      { at: 13.6, do: 'spot', target: 'queue-headline' },
    ],
  },
  {
    start: 31,
    title: 'A weight conflict',
    caption: 'Manifest 36,000 lb, scale 40,500 lb. A 12.5 percent gap.',
    screen: `The Ask step filters the queue to two boxes. ${WEIGHT_BOX} opens, and its conflict card shows both weights.`,
    narration: 'This box needs an answer. The manifest says 36,000 pounds. The scale says 40,500, a 12.5 percent gap. Rung does not guess. It asks.',
    actions: [
      { at: 0, do: 'spot', target: 'ladder-ASK' },
      { at: 0.8, do: 'click', target: 'ladder-ASK' },
      { at: 1.2, do: 'spot', target: `row-${WEIGHT_BOX}` },
      { at: 2.8, do: 'route', hash: `#/box/${WEIGHT_BOX}` },
      { at: 3.2, do: 'spot', target: 'conflicts' },
      { at: 9.2, do: 'spot', target: 'decision' },
    ],
  },
  {
    start: 43,
    title: 'The ask call',
    caption: 'Simulated call in this video. The live call runs on a Retell AI voice agent.',
    screen: 'Call the trucker starts. The transcript fills line by line, the outcome reads Trucker backs the scale, and the decision turns to Hand.',
    narration:
      'Its voice agent, built on Retell AI, calls the trucker. This video plays the simulated version of that call, so it runs the same every time. The trucker backs the scale. Rung still will not pick a side. The box goes to Hand, and a planner decides.',
    actions: [
      { at: 0, do: 'spot', target: 'call-button' },
      { at: 1.4, do: 'post', path: `/api/call/${WEIGHT_BOX}`, body: { mock_outcome: 'confirmed_loaded', simulate: true } },
      { at: 2, do: 'spot', target: 'ask-call' },
      { at: 12.4, do: 'spot', target: 'call-outcome' },
      { at: 15.2, do: 'spot', target: 'decision' },
    ],
  },
  {
    start: 62,
    title: 'The Retell AI prompt',
    caption: 'The exact agent prompt, read from the script that creates the Retell agent.',
    screen: 'The Voice agent prompt drawer scrolls through Identity, Saying a container number, the Weight check call with its four outcomes, the tools, and the fields read back after the call.',
    narration:
      "This is the exact prompt that agent runs, read from the setup script that creates it in Retell. Who it is, how to say a container number, the weight check steps, and the only four outcomes it may record. The model runs the conversation. Rung's rules decide what happens next.",
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'panel', panel: 'prompt' },
      { at: 1.4, do: 'spot', target: 'prompt-identity' },
      { at: 8, do: 'spot', target: 'prompt-saying-a-container-number' },
      { at: 10.2, do: 'spot', target: 'prompt-weight-check-call' },
      { at: 15.4, do: 'spot', target: 'prompt-tools-the-agent-can-use' },
      { at: 18.4, do: 'spot', target: 'prompt-read-back-after-the-call' },
    ],
  },
  {
    start: 83,
    title: 'Crisis mode',
    caption: 'Harbor Night. Lanes close, a customs hold lands, the terminal feed goes dark.',
    screen:
      'The Gate plan. The night starts over and the scripted events land one by one: Crisis mode at 22:05, lanes 4 to 6 close at 22:10, a customs hold at 22:20, and the terminal feed goes dark at 22:40.',
    narration:
      'Now the worst night of the year, Harbor Night. Lanes 4 to 6 close. Rung re-plans every truck in under a millisecond and keeps 96 of 129 moving. Closing the terminal would keep none. Customs drops a new hold on a dry box. Then the terminal feed goes dark. By our model, Rung saves about 90 idle truck hours and over 700 kilograms of CO2.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'panel', panel: null },
      { at: 0.1, do: 'route', hash: '#/gate' },
      { at: 0.2, do: 'post', path: '/api/scenario/reset', body: {} },
      { at: 0.6, do: 'spot', target: 'gate-hero' },
      { at: 1.6, ...jump('+00:05') },
      { at: 1.9, do: 'spot', target: 'mode-pill' },
      { at: 4.4, ...jump('+00:10') },
      { at: 4.8, do: 'spot', target: 'gate-hero' },
      { at: 15, ...jump('+00:20') },
      { at: 15.3, do: 'spot', target: 'latest-event' },
      { at: 18.8, ...jump('+00:40') },
      { at: 19.1, do: 'spot', target: 'dark-banner' },
      { at: 21.8, do: 'spot', target: 'gate-hero' },
    ],
  },
  {
    start: 110,
    title: 'What went wrong tonight',
    caption: 'The feed is dark. Only the 21 trucks due now go to a planner.',
    screen: 'The Queue in Crisis mode with its incident cards. Show the Hand boxes filters the queue to the 21 Hand boxes.',
    narration: 'The queue now lists what went wrong tonight. With the feed dark, Rung does not hand a hundred boxes to a person. Only the 21 trucks due now go to Hand.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'route', hash: '#/' },
      { at: 0.5, do: 'spot', target: 'crisis-board' },
      { at: 3.6, do: 'spot', target: 'incident-feed-terminal' },
      { at: 8.4, do: 'click', target: 'incident-feed-terminal' },
      { at: 9, do: 'spot', target: 'ladder-HAND', scroll: 'none' },
    ],
  },
  {
    start: 123,
    title: 'The box that cannot go',
    caption: `${REEFER_BOX}. Chilled beef, no power, under a customs hold. Rung says Hold.`,
    screen: `The ${REEFER_BOX} box card: the red Crisis line, the reefer warm up clock past its limit, and the Hold decision with the customs broker as owner.`,
    narration:
      'This box cannot wait, and cannot go. Chilled beef, power off since nine, already past its loss limit, under a customs hold. Releasing it is not ours to give. Rung says Hold, names the customs broker, and attaches the reefer evidence.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'route', hash: `#/box/${REEFER_BOX}` },
      { at: 0.6, do: 'spot', target: 'crisis-line' },
      { at: 3, do: 'spot', target: 'reefer-card' },
      { at: 9.4, do: 'spot', target: 'decision' },
    ],
  },
  {
    start: 140,
    title: 'The audit log',
    caption: 'Every step change, call, and override, with its reason.',
    screen: `The Audit log drawer, filtered to ${REEFER_BOX}.`,
    narration: 'Every step, call, and override lands in the audit log, with its reason in plain words.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'panel', panel: 'audit', box: REEFER_BOX },
      { at: 0.8, do: 'spot', target: 'audit-lines' },
    ],
  },
  {
    start: 147,
    title: 'One engine, any port',
    caption: 'Rotterdam: kilograms, euros, Dutch customs, and Portbase. Same rules.',
    screen: 'The region switches to Rotterdam. The status line reads Portbase, and the Sources and trust tab shows kilograms, euros, and the Douane hold.',
    narration: 'Rung is not tied to one port. Switch to Rotterdam and the same engine speaks kilograms, euros, Dutch customs, and Portbase. Same rules, same decisions.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'panel', panel: null },
      { at: 0.3, ...region('rotterdam') },
      { at: 0.6, do: 'spot', target: 'status-line' },
      { at: 3.2, do: 'click', target: 'tab-sources' },
      { at: 3.4, do: 'spot', target: 'sources' },
      { at: 8.6, do: 'spot', target: 'decision' },
    ],
  },
  {
    start: 157,
    title: 'Rules decide. People sign.',
    caption: 'Rules decide. People sign.',
    screen: 'Closing card: built with Retell AI, the Terminal49 data model, FastAPI, React, and SciPy. Funding path NSF SBIR Phase I. Region profiles.',
    narration: 'Rules decide. People sign. Rung, built with Retell AI, the Terminal49 data model, FastAPI, React, and SciPy. Next, NSF SBIR Phase One.',
    actions: [
      { at: 0, do: 'spot', target: null },
      { at: 0, do: 'card', card: 'closing' },
      { at: 0.8, ...region('los_angeles') },
    ],
  },
]

export function chapterEnd(index: number): number {
  return DEMO_CHAPTERS[index + 1]?.start ?? DEMO_TOTAL
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** m:ss for a number of seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
