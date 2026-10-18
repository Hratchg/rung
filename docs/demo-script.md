# Rung demo script

The narration for Rung's demo mode, timed to the second. Read it aloud while the demo plays, or record
it as a voice over. Demo mode runs 2:46 and holds on its closing card until you stop it, so the
video stays under the 3:00 cap.

400 words of narration, about 2:28 at an easy 2.7 words a second. Every chapter leaves a
little silence at its end, so you can breathe and let the screen catch up.

This file and `demo-script.srt` are generated from `frontend/src/demoScript.ts`, the same timeline the
app plays. Do not edit them by hand. Change the timeline, then run `npm run demo-script` in `frontend`.

## Start demo mode

1. Run `make demo` and open http://127.0.0.1:8000 in Chrome.
2. Size the window to 1920 by 1080 at 100 percent zoom, or press F11 for full screen.
3. Press **Play demo** in the Demo controls dock at the bottom, next to **Voice agent prompt**. Or open http://127.0.0.1:8000/?demo=1, which starts the demo as soon as the page loads.

Demo mode resets Pier 7 to Everyday mode at 22:00 on Tuesday, pauses the clock, sets the region to
Los Angeles, and plays every step on its own. The dock hides while it runs. A lower third names each
chapter, and a thin amber bar along the bottom edge shows progress. Press **Esc** at any time to stop.
At the end the closing card stays up until you press **Esc** or **Close**. Stopping puts the region back
to Los Angeles and brings the dock back.

The ask call in demo mode is always the simulated call, even when Retell keys are loaded, so every take
is the same. The screen and the narration both say so. The prompt chapter shows the real Retell AI
agent prompt, read from the script that creates the agent.

## Add your voice

### Option 1. Record the screen and your microphone in one take

Use a recorder that captures the screen and the microphone together: OBS Studio, QuickTime Player on
macOS (File, New Screen Recording, then Options, Microphone), or the Xbox Game Bar on Windows (Windows key
and G, with the microphone on). Start recording, open http://127.0.0.1:8000/?demo=1, and start reading with the title
card. Begin each chapter below when its lower third appears. The number on the left of the lower third
is the chapter number. Stop the recording on the closing card.

### Option 2. Record the voice over on its own and merge it

Use the silent recording `rung_demo_mode_final.mp4`, or record your own take without sound. Play it back, and record
your voice into `voice.m4a` while you watch, starting with the title card at 0:00. Then merge the two:

```bash
ffmpeg -i rung_demo_mode_final.mp4 -i voice.m4a -map 0:v -map 1:a -c:v copy -c:a aac -shortest rung-demo-with-voice.mp4
```

To rehearse, play `rung_demo_mode_with_script.mp4`, which has this narration burned in as subtitles, or open
`demo-script.srt` as a subtitle track next to `rung_demo_mode_final.mp4` in VLC.

## Run of show

| Start | Chapter | Length | Words |
| --- | --- | --- | --- |
| 0:00 | Title card. The problem | 15 s | 37 |
| 0:15 | 1. Everyday mode | 16 s | 42 |
| 0:31 | 2. A weight conflict | 12 s | 24 |
| 0:43 | 3. The ask call | 19 s | 47 |
| 1:02 | 4. The Retell AI prompt | 21 s | 50 |
| 1:23 | 5. Crisis mode | 27 s | 65 |
| 1:50 | 6. What went wrong tonight | 13 s | 31 |
| 2:03 | 7. The box that cannot go | 17 s | 41 |
| 2:20 | 8. The audit log | 7 s | 16 |
| 2:27 | 9. One engine, any port | 10 s | 25 |
| 2:37 | Closing card. Rules decide. People sign. | 9 s | 22 |
| 2:46 | End. The closing card holds until you stop it | | |

## Script

### 0:00 Title card. The problem

0:00 to 0:15, 15 seconds. 37 words, about 14 seconds to read.

**On screen.** Title card: Rung, gate triage for a container terminal.

**Lower third.** None. The title card fills the screen.

> Every truck leaving a container terminal passes a gate. Five systems describe each box, and they often disagree. On a bad night the gate closes, and every truck in line pays in delay, fees, and idling diesel.

### 0:15 1. Everyday mode

0:15 to 0:31, 16 seconds. 42 words, about 16 seconds to read.

**On screen.** The Queue in Everyday mode: the summary bar, the headline, and the ladder from Release to Hand.

**Lower third.** Tuesday 22:00. 191 boxes, 173 on Release, 34 need a planner.

> This is Rung at Pier 7, on an ordinary Tuesday. 191 boxes wait. Rung reads five sources per box and puts each on the gentlest safe step of this ladder, from Release to Hand, where a person decides. 34 need a planner.

### 0:31 2. A weight conflict

0:31 to 0:43, 12 seconds. 24 words, about 9 seconds to read.

**On screen.** The Ask step filters the queue to two boxes. CMAU9939083 opens, and its conflict card shows both weights.

**Lower third.** Manifest 36,000 lb, scale 40,500 lb. A 12.5 percent gap.

> This box needs an answer. The manifest says 36,000 pounds. The scale says 40,500, a 12.5 percent gap. Rung does not guess. It asks.

### 0:43 3. The ask call

0:43 to 1:02, 19 seconds. 47 words, about 17 seconds to read.

**On screen.** Call the trucker starts. The transcript fills line by line, the outcome reads Trucker backs the scale, and the decision turns to Hand.

**Lower third.** Simulated call in this video. The live call runs on a Retell AI voice agent.

> Its voice agent, built on Retell AI, calls the trucker. This video plays the simulated version of that call, so it runs the same every time. The trucker backs the scale. Rung still will not pick a side. The box goes to Hand, and a planner decides.

### 1:02 4. The Retell AI prompt

1:02 to 1:23, 21 seconds. 50 words, about 19 seconds to read.

**On screen.** The Voice agent prompt drawer scrolls through Identity, Saying a container number, the Weight check call with its four outcomes, the tools, and the fields read back after the call.

**Lower third.** The exact agent prompt, read from the script that creates the Retell agent.

> This is the exact prompt that agent runs, read from the setup script that creates it in Retell. Who it is, how to say a container number, the weight check steps, and the only four outcomes it may record. The model runs the conversation. Rung's rules decide what happens next.

### 1:23 5. Crisis mode

1:23 to 1:50, 27 seconds. 65 words, about 24 seconds to read.

**On screen.** The Gate plan. The night starts over and the scripted events land one by one: Crisis mode at 22:05, lanes 4 to 6 close at 22:10, a customs hold at 22:20, and the terminal feed goes dark at 22:40.

**Lower third.** Harbor Night. Lanes close, a customs hold lands, the terminal feed goes dark.

> Now the worst night of the year, Harbor Night. Lanes 4 to 6 close. Rung re-plans every truck in under a millisecond and keeps 96 of 129 moving. Closing the terminal would keep none. Customs drops a new hold on a dry box. Then the terminal feed goes dark. By our model, Rung saves about 90 idle truck hours and over 700 kilograms of CO2.

### 1:50 6. What went wrong tonight

1:50 to 2:03, 13 seconds. 31 words, about 11 seconds to read.

**On screen.** The Queue in Crisis mode with its incident cards. Show the Hand boxes filters the queue to the 21 Hand boxes.

**Lower third.** The feed is dark. Only the 21 trucks due now go to a planner.

> The queue now lists what went wrong tonight. With the feed dark, Rung does not hand a hundred boxes to a person. Only the 21 trucks due now go to Hand.

### 2:03 7. The box that cannot go

2:03 to 2:20, 17 seconds. 41 words, about 15 seconds to read.

**On screen.** The MSKU1234567 box card: the red Crisis line, the reefer warm up clock past its limit, and the Hold decision with the customs broker as owner.

**Lower third.** MSKU1234567. Chilled beef, no power, under a customs hold. Rung says Hold.

> This box cannot wait, and cannot go. Chilled beef, power off since nine, already past its loss limit, under a customs hold. Releasing it is not ours to give. Rung says Hold, names the customs broker, and attaches the reefer evidence.

### 2:20 8. The audit log

2:20 to 2:27, 7 seconds. 16 words, about 6 seconds to read.

**On screen.** The Audit log drawer, filtered to MSKU1234567.

**Lower third.** Every step change, call, and override, with its reason.

> Every step, call, and override lands in the audit log, with its reason in plain words.

### 2:27 9. One engine, any port

2:27 to 2:37, 10 seconds. 25 words, about 9 seconds to read.

**On screen.** The region switches to Rotterdam. The status line reads Portbase, and the Sources and trust tab shows kilograms, euros, and the Douane hold.

**Lower third.** Rotterdam: kilograms, euros, Dutch customs, and Portbase. Same rules.

> Rung is not tied to one port. Switch to Rotterdam and the same engine speaks kilograms, euros, Dutch customs, and Portbase. Same rules, same decisions.

### 2:37 Closing card. Rules decide. People sign.

2:37 to 2:46, 9 seconds. 22 words, about 8 seconds to read.

**On screen.** Closing card: built with Retell AI, the Terminal49 data model, FastAPI, React, and SciPy. Funding path NSF SBIR Phase I. Region profiles.

**Lower third.** None. The closing card fills the screen.

> Rules decide. People sign. Rung, built with Retell AI, the Terminal49 data model, FastAPI, React, and SciPy. Next, NSF SBIR Phase One.

## Rules checklist

- [x] **Demo video under 3 minutes.** Demo mode runs 2:46. Stop the recording within 10 seconds of the closing card.
- [x] **The video covers the Retell AI prompts.** At 1:02 the Voice agent prompt drawer walks the exact prompt the agent runs: Identity, Saying a container number, the Weight check call with its four outcomes, the tools the agent can use, and the fields read back after the call. It is read from `scripts/retell_setup.py`, the script that creates the agent in Retell.
- [x] **The Retell AI call is shown honestly.** At 0:43 the call plays the simulated version, and the chip, the lower third, and the narration all say so.
- [x] **Theme: limit delays, costs, or emissions.** At 1:23 Rung keeps 96 of 129 trucks moving where closing the terminal keeps none, and models the idle truck hours and kilograms of CO2 it saves.
- [x] **Twist, global application.** At 2:27 the same engine runs as Rotterdam, in kilograms, euros, Dutch customs, and Portbase.
- [x] **Twist, federal funding pathway.** The closing card at 2:37 names NSF SBIR Phase I. The plan is in `docs/funding-pathway.md`.
- [ ] **Twist, poster.** Printed for Demo Day. The source and print file are in `docs/poster/`.
- [ ] **Deck.** Google Slides, 10 slides at most. It is not part of this repo.
- [ ] **Voice.** Add it with option 1 or option 2 above, then watch the final file once from start to end.
