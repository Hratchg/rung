// Renders docs/demo-script.md and docs/demo-script.srt from the demo timeline. Pure, so the test can
// check the committed files and scripts/demo-script.ts can write them under plain Node.
import { DEMO_CHAPTERS, DEMO_TOTAL, WORDS_PER_SECOND, chapterEnd, clock, wordCount } from './demoScript.ts'

const LAST = DEMO_CHAPTERS.length - 1
const VIDEO = 'rung_demo_mode_final.mp4'
const REHEARSAL = 'rung_demo_mode_with_script.mp4'
const APP = 'http://127.0.0.1:8000'
/** Longest subtitle cue before it splits at a comma. */
const CUE_WORDS = 14
/** A cue this short flashes by, so it joins its neighbour. */
const SHORT_CUE = 4

function label(i: number): string {
  const title = DEMO_CHAPTERS[i].title
  if (i === 0) return `Title card. ${title}`
  if (i === LAST) return `Closing card. ${title}`
  return `${i}. ${title}`
}

function startOf(title: string): string {
  const chapter = DEMO_CHAPTERS.find((c) => c.title === title)
  if (!chapter) throw new Error(`No demo chapter called ${title}`)
  return clock(chapter.start)
}

const seconds = (words: number) => Math.round(words / WORDS_PER_SECOND)

export function demoMarkdown(): string {
  const words = DEMO_CHAPTERS.reduce((n, c) => n + wordCount(c.narration), 0)
  const prompt = startOf('The Retell AI prompt')
  const lines = [
    '# Rung demo script',
    '',
    `The narration for Rung's demo mode, timed to the second. Read it aloud while the demo plays, or record`,
    `it as a voice over. Demo mode runs ${clock(DEMO_TOTAL)} and holds on its closing card until you stop it, so the`,
    'video stays under the 3:00 cap.',
    '',
    `${words} words of narration, about ${clock(words / WORDS_PER_SECOND)} at an easy ${WORDS_PER_SECOND} words a second. Every chapter leaves a`,
    'little silence at its end, so you can breathe and let the screen catch up.',
    '',
    'This file and `demo-script.srt` are generated from `frontend/src/demoScript.ts`, the same timeline the',
    'app plays. Do not edit them by hand. Change the timeline, then run `npm run demo-script` in `frontend`.',
    '',
    '## Start demo mode',
    '',
    `1. Run \`make demo\` and open ${APP} in Chrome.`,
    '2. Size the window to 1920 by 1080 at 100 percent zoom, or press F11 for full screen.',
    `3. Press **Play demo** in the Demo controls dock at the bottom, next to **Voice agent prompt**. Or open ${APP}/?demo=1, which starts the demo as soon as the page loads.`,
    '',
    'Demo mode resets Pier 7 to Everyday mode at 22:00 on Tuesday, pauses the clock, sets the region to',
    'Los Angeles, and plays every step on its own. The dock hides while it runs. A lower third names each',
    'chapter, and a thin amber bar along the bottom edge shows progress. Press **Esc** at any time to stop.',
    'At the end the closing card stays up until you press **Esc** or **Close**. Stopping puts the region back',
    'to Los Angeles and brings the dock back.',
    '',
    'The ask call in demo mode is always the simulated call, even when Retell keys are loaded, so every take',
    'is the same. The screen and the narration both say so. The prompt chapter shows the real Retell AI',
    'agent prompt, read from the script that creates the agent.',
    '',
    '## Add your voice',
    '',
    '### Option 1. Record the screen and your microphone in one take',
    '',
    'Use a recorder that captures the screen and the microphone together: OBS Studio, QuickTime Player on',
    'macOS (File, New Screen Recording, then Options, Microphone), or the Xbox Game Bar on Windows (Windows key',
    `and G, with the microphone on). Start recording, open ${APP}/?demo=1, and start reading with the title`,
    'card. Begin each chapter below when its lower third appears. The number on the left of the lower third',
    'is the chapter number. Stop the recording on the closing card.',
    '',
    '### Option 2. Record the voice over on its own and merge it',
    '',
    `Use the silent recording \`${VIDEO}\`, or record your own take without sound. Play it back, and record`,
    'your voice into `voice.m4a` while you watch, starting with the title card at 0:00. Then merge the two:',
    '',
    '```bash',
    `ffmpeg -i ${VIDEO} -i voice.m4a -map 0:v -map 1:a -c:v copy -c:a aac -shortest rung-demo-with-voice.mp4`,
    '```',
    '',
    `To rehearse, play \`${REHEARSAL}\`, which has this narration burned in as subtitles, or open`,
    `\`demo-script.srt\` as a subtitle track next to \`${VIDEO}\` in VLC.`,
    '',
    '## Run of show',
    '',
    '| Start | Chapter | Length | Words |',
    '| --- | --- | --- | --- |',
    ...DEMO_CHAPTERS.map((c, i) => `| ${clock(c.start)} | ${label(i)} | ${chapterEnd(i) - c.start} s | ${wordCount(c.narration)} |`),
    `| ${clock(DEMO_TOTAL)} | End. The closing card holds until you stop it | | |`,
    '',
    '## Script',
    '',
    ...DEMO_CHAPTERS.flatMap((c, i) => {
      const n = wordCount(c.narration)
      const card = i === 0 ? 'None. The title card fills the screen.' : i === LAST ? 'None. The closing card fills the screen.' : c.caption
      return [
        `### ${clock(c.start)} ${label(i)}`,
        '',
        `${clock(c.start)} to ${clock(chapterEnd(i))}, ${chapterEnd(i) - c.start} seconds. ${n} words, about ${seconds(n)} seconds to read.`,
        '',
        `**On screen.** ${c.screen}`,
        '',
        `**Lower third.** ${card}`,
        '',
        `> ${c.narration}`,
        '',
      ]
    }),
    '## Rules checklist',
    '',
    `- [x] **Demo video under 3 minutes.** Demo mode runs ${clock(DEMO_TOTAL)}. Stop the recording within 10 seconds of the closing card.`,
    `- [x] **The video covers the Retell AI prompts.** At ${prompt} the Voice agent prompt drawer walks the exact prompt the agent runs: Identity, Saying a container number, the Weight check call with its four outcomes, the tools the agent can use, and the fields read back after the call. It is read from \`scripts/retell_setup.py\`, the script that creates the agent in Retell.`,
    `- [x] **The Retell AI call is shown honestly.** At ${startOf('The ask call')} the call plays the simulated version, and the chip, the lower third, and the narration all say so.`,
    `- [x] **Theme: limit delays, costs, or emissions.** At ${startOf('Crisis mode')} Rung keeps 96 of 129 trucks moving where closing the terminal keeps none, and models the idle truck hours and kilograms of CO2 it saves.`,
    `- [x] **Twist, global application.** At ${startOf('One engine, any port')} the same engine runs as Rotterdam, in kilograms, euros, Dutch customs, and Portbase.`,
    `- [x] **Twist, federal funding pathway.** The closing card at ${startOf('Rules decide. People sign.')} names NSF SBIR Phase I. The plan is in \`docs/funding-pathway.md\`.`,
    '- [ ] **Twist, poster.** Printed for Demo Day. The source and print file are in `docs/poster/`.',
    '- [ ] **Deck.** Google Slides, 10 slides at most. It is not part of this repo.',
    '- [ ] **Voice.** Add it with option 1 or option 2 above, then watch the final file once from start to end.',
    '',
  ]
  return lines.join('\n')
}

function cues(text: string): string[] {
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.?!])\s+/)) {
    const parts = wordCount(sentence) <= CUE_WORDS ? [sentence] : sentence.split(/(?<=,)\s+/)
    const first = out.length
    let carry = ''
    parts.forEach((part, i) => {
      const piece = carry ? `${carry} ${part}` : part
      carry = ''
      const n = wordCount(piece)
      if (i < parts.length - 1 && n < SHORT_CUE) {
        carry = piece
        return
      }
      const prev = out.length - 1
      const both = prev >= 0 ? wordCount(out[prev]) + n : Infinity
      const sameSentence = prev >= first && both <= CUE_WORDS
      const shortSentence = parts.length === 1 && n < SHORT_CUE && both <= CUE_WORDS + 2
      if (sameSentence || shortSentence) out[prev] = `${out[prev]} ${piece}`
      else out.push(piece)
    })
  }
  return out
}

function stamp(s: number): string {
  const ms = Math.round(s * 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

export function demoSubtitles(): string {
  const blocks: string[] = []
  DEMO_CHAPTERS.forEach((c, i) => {
    const end = chapterEnd(i) - 0.1
    let at = c.start
    for (const text of cues(c.narration)) {
      const to = Math.min(end, at + wordCount(text) / WORDS_PER_SECOND)
      blocks.push(`${blocks.length + 1}\n${stamp(at)} --> ${stamp(to)}\n${text}\n`)
      at = to
    }
  })
  return blocks.join('\n')
}
