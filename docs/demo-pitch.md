# Rung demo pitch

A pitch that fits in 2:51 with the live voice call and all three hackathon twists, a click by click
run of show on the real app, a 30 second version, and a judges Q&A sheet. Button and label names
below are exactly as they appear on screen. Planner controls sit in the app itself. Everything that
drives the scenario sits in the dashed amber **Demo controls** dock at the bottom of the screen.

The three twists, and where each one shows:

| Twist | What it asked | Where it is in the pitch |
| --- | --- | --- |
| 1, funding | A federal funding pathway to launch the venture | 2:30, the funding card: NSF SBIR Phase I first, DoD with USTRANSCOM and SDDC, and MARAD PIDP as alternatives. Plan in [funding-pathway.md](funding-pathway.md) |
| 2, global | How the same solution holds up in another part of the world | 2:03, the same box in Los Angeles, Rotterdam, and Shanghai on the live app. Plan in [global.md](global.md) |
| 3, poster | A 24 by 36 inch Demo Day poster | 2:40, the poster, [rung-poster.pdf](poster/rung-poster.pdf) |

The **Twist log** at 2:20 shows all three as merged, with the files each one added and its git diff.

This page is for presenting live. For the recorded demo video, use demo mode instead: **Play demo** in
the dock, or http://127.0.0.1:8000/?demo=1, plays the whole story on its own in 2:46, with the Retell AI
prompt at 1:02. The [demo script](demo-script.md) has the narration timed to it, two ways to add your
voice, and a rules checklist.

## Before you go on

1. Start the app with `make demo`. For the live call, set it up beforehand: `make tunnel` in a second terminal, `make retell-setup` once, then restart `make demo`. The steps are in the [README](../README.md#a-live-retell-call). A quick tunnel can expire. If calls stop recording an outcome, stop `make tunnel` and start it again. It points the Retell agent at the new address on its own.
2. Open http://127.0.0.1:8000 in a browser sized for the projector, 1280 by 720 or larger. Open `docs/poster/rung-poster.pdf` in a second tab of the same browser.
3. Make one test call on any box, so the browser has already granted the microphone. Then press **Everyday** in the dock to start the night over.
4. Check that the **Region** menu in the status line under the header reads **Los Angeles**. In the dock, press **Pause** next to **Speed**. The header should read **Everyday mode**, Tuesday, 22:00, the summary at the top of the Queue should read 6 of 6 lanes open, and the dock should read Scenario `+00:00`.5. Open `CMAU9939083` and check the chip in the **Call the trucker** panel. **Retell web call** means the live agent is loaded. **Simulated call** means no Retell key is loaded and the call will be the scripted one. That still works: leave **The simulated trucker answers** on **Trucker backs the scale**.
6. Close every terminal and editor window. Never put `.env` or a terminal on the projector.
7. Rehearse the call once with a stopwatch. With the three trucker lines below, the answer lands about 35 seconds after you press **Call the trucker**, and the agent hangs up about 60 seconds after it. If the answer takes longer, use the cut rules at the end of the run of show.

The live call needs someone to play the trucker, Dana Ruiz of Pacific Coast Dray. The presenter can
do it, or a teammate next to the laptop microphone. Keep each answer short and wait for the agent to
finish its turn. The lines:

- "Yes, this is Dana Ruiz with Pacific Coast Dray."
- "Yes, it is loaded. The shipper added pallets at the last minute."
- "Okay, thank you. Goodbye."

## Run of show

| Start | Beat | Length |
| --- | --- | --- |
| 0:00 | The problem | 9 s |
| 0:09 | Tuesday: the queue and the ladder | 12 s |
| 0:21 | The live ask call | 49 s |
| 1:10 | The voice agent prompt | 15 s |
| 1:25 | Harbor Night: the gate plan and the CO2 | 29 s |
| 1:54 | The box that matters | 9 s |
| 2:03 | Twist 2: the same box in Rotterdam and Shanghai | 17 s |
| 2:20 | The Twist log | 10 s |
| 2:30 | Twist 1: the funding pathway | 10 s |
| 2:40 | Twist 3: the poster and the close | 11 s |
| 2:51 | End | |

### 0:00 The problem (9 s)

Screen: the Queue, Tuesday, clock paused at 22:00.

> Five systems describe every box at a container terminal, and they disagree. On a bad night the safe
> move is to close the gate, and every truck in line pays.

### 0:09 Tuesday: the queue and the ladder (12 s)

Screen: the Queue. Point at the **Everyday mode** pill in the header, then the headline **34 boxes
need your decision**, then sweep left to right across the ladder: Release, Watch, Ask, Slow, Hold,
and Hand set apart on the right.

> This is Rung at Pier 7, Los Angeles. It reads all five sources for each of 191 boxes and puts each
> one on the gentlest safe step, from Release to Hand.

Click: the **Ask** step in the ladder. Two rows remain.

> Ask: two boxes need fresher facts before anyone acts.

Click: **CMAU9939083**.

### 0:21 The live ask call (49 s)

Screen: the box card. The big card reads **Rung recommends ASK, Get fresher facts** and **The weights
disagree. Get a reweigh or call the trucker before it leaves.**

> The manifest says 36,000 pounds. The scale says 40,500. Rung does not guess. It asks the trucker.

Click: **Call the trucker** in the **Call the trucker** panel by 0:24. The status reads Connecting, then
On the call.

The agent introduces itself as the Pier 7 gate desk, spells the box number, checks it has Dana Ruiz,
reads both weights, and asks whether the box is loaded as weighed. The trucker answers with the three
lines above. Say nothing over the call. Let the room hear it.

The answer lands about 35 seconds after the click, around 1:00. The outcome box reads **Trucker backs
the scale**, and the big card turns violet: **HAND, You decide now**, with **The trucker backed the
scale, so the manifest is wrong. You decide what happens to this box.** The button under **Your move**
now reads **Decide**.

> The agent records the answer straight into Rung, mid call. The trucker backed the scale, so the
> manifest is wrong, and a person decides.

The agent then reads the answer back and says goodbye, so the call keeps running for about 25 more
seconds and ends while the prompt drawer is open. Stay on the box card until it hangs up: leaving the
card ends the call. The transcript lands on the card after the agent hangs up.

### 1:10 The voice agent prompt (15 s)

Click: **See the agent prompt**, next to **Call again** in the same panel. The **Voice agent prompt**
drawer opens. Scroll slowly from **Identity** down to **Weight check call** and its four outcomes.

> That was a real call, through Retell. This is the exact prompt the agent runs, read live from our
> setup script. The weight check steps, and the only four answers it may record. The model runs the
> call. Rung's rules decide what happens next.

Wait until the agent hangs up, about 60 seconds after the click, then press **Escape** to close the drawer.

### 1:25 Harbor Night: the gate plan and the CO2 (29 s)

Click: the **Gate plan** tab. Then press **2** next to **Speed** in the dock. Every scenario minute
now takes half a real second, and the scripted events fire on their own.

> Same app, the worst night of the year: Harbor Night.

- After 3 seconds the header turns dark blue and the pill reads **Crisis mode**, next to **Harbor Night**.
- After 5 seconds lanes 4 to 6 close. The red summary reads **Lanes 4 to 6 are closed. Rung keeps 96 of 129 trucks moving**, with the idle hours and CO2 it saves.
- After 10 seconds a customs hold lands on `TCLU7654321`. Press **5** to speed up.
- About 4 seconds later the red **Terminal feed dark** banner appears. Press **Pause** right away. The dock reads `+00:40`.
> Lanes 4 to 6 close, and Rung re-plans every booked truck in under a millisecond, reefers and last
> free day boxes first. A customs hold lands, and the terminal feed goes dark. Rung keeps running from
> its last snapshot, and only trucks due at the gate now come to the planner.

Point at the four cards under the headline: Rung 96 against Closed terminal 0, reefers 20 of 20, last
free day boxes 28 of 28, and truck idle CO2.

> Rung keeps 96 of 129 trucks moving, every reefer, and every last free day box. Closing the terminal
> keeps none. And by our model it saves about 750 kilograms of CO2 from trucks idling at the gate.

At the pause the headline reads **saves 92 idle hours and 749 kg of CO2**. The fourth card shows the
two totals behind it, Rung about 302 kg against Closed terminal about 1,051 kg, and the 750 kg in the
line is the difference. The plan changes as the night moves, so these numbers drift by a few kg.

### 1:54 The box that matters (9 s)

Click: the **Queue** tab. The red **What went wrong tonight** cards name each problem. Click
**MSKU1234567** in the Hold group. If it is below the fold, press the **Hold** step in the ladder first.
Screen: a red line reads **Crisis mode. This box is affected tonight because its lane is closed, a
feed it needs is dark and its reefer is in trouble under a hold.** The big card reads **HOLD, Waits
for its owner** and **Keep this truck at the gate until the customs broker clears it. The reefer
evidence goes with it.** The amber reefer card below it reads **Product passed 2.6 C at 21:53**.

> Chilled beef, under a customs hold, power off and warming. Rung says Hold, names the owner, and
> attaches the reefer evidence. The planner confirms with one tap, and it lands in the audit log.

Click: **Confirm hold** under **Your move**.

### 2:03 Twist 2: the same box in Rotterdam and Shanghai (17 s)

Stay on `MSKU1234567`. Scroll down until **Where the sources disagree** shows its first conflict,
**The manifest and the scale disagree**, with **Manifest says 2,400 lb** and **Scale says 44,100 lb**.
Keep the **Owner** row of the big card in view.

> Twist two: go global. Same box, same engine. Switch the port from Los Angeles to Rotterdam.

Click: the **Region** menu in the status line under the header, which reads **Los Angeles**, then
**Rotterdam**. Point at what changed:

- The clock label in the header reads **CEST**.
- The status line reads **All data simulated. Portbase adapter not connected**.
- **Owner** reads **customs agent**.
- The conflict reads **Manifest says 1,089 kg** and **Scale says 20,003 kg**.
- The ladder still shows **Hold**, and **Urgency** still reads **95 High**.

> Rotterdam: Dutch Customs, so a customs agent owns the hold. The weights read in kilograms, fees in
> euros, times in CEST. Still Hold, same urgency.

Click: the **Region** menu, then **Shanghai**. The clock label reads **CST**, the status line names the
**China Single Window** adapter, and **Owner** reads **customs declaration agent**.

> Shanghai: China Customs and a customs declaration agent, yuan and CST. The ladder, trust, and gate
> plan never change. Only the edges do.

Leave the region on **Shanghai** for now. Set it back to **Los Angeles** after the pitch.

### 2:20 The Twist log (10 s)

Click: **More controls** in the dock, then **Twist log**. The **Twist log** drawer lists three rows,
`twist-1-funding`, `twist-2-global`, and `twist-3-poster`, each marked **Merged**, with **Received**,
**Merged**, **Added**, and its **Git diff**. Scroll slowly to the bottom.

> Rung took in all three hackathon twists. The Twist log shows each one merged, with the files it
> added and its git diff.

Press **Escape** to close the drawer, then **Fewer controls**.

### 2:30 Twist 1: the funding pathway (10 s)

In the video this is a title card. Live, switch to the poster tab and point at its **Federal funding
pathway** panel, which lists the same three programs.

| Role | Program | One line |
| --- | --- | --- |
| Primary, Launch | NSF SBIR Phase I, America's Seed Fund, solicitation NSF 26-510 | Up to $305K over 6 to 18 months to prove Rung on live San Pedro Bay terminal data, in a shadow mode pilot with a Port of Long Beach terminal |
| Alternative, Harden | DoD SBIR with USTRANSCOM and SDDC | Monthly DoD SBIR releases, Phase I about $315K. Harbor Night run as a port readiness exercise at strategic seaports such as Long Beach |
| Alternative, Scale | MARAD PIDP, the Port Infrastructure Development Program, port led | Up to 80 percent federal share to roll Rung out across every gate lane, with the port as lead applicant |

> Twist one: funding. Rung launches on an NSF SBIR Phase I grant. DoD, through USTRANSCOM and SDDC,
> and MARAD's port grants are the alternatives.

### 2:40 Twist 3: the poster and the close (11 s)

Screen: the poster tab, `rung-poster.pdf`, fitted to the screen. Zoom in on the **Harbor Night results**
band, then on the header, **Keep the gate open when the data goes bad.**

> Twist three: the 24 by 36 inch Demo Day poster, built from the same numbers the app just showed.
> Keep the gate open when the data goes bad. That is Rung.

### Cut rules

- If the call outcome has not landed by 1:10, keep talking over the hero card until it does, then skip the prompt drawer scroll and only open and close it.
- If the clock reads 2:10 or later when you reach the box that matters, skip **Confirm hold** and go straight to the region switch.
- If the clock reads 2:30 or later after the region switch, skip the Twist log and go to the poster tab. Name the three funding programs while pointing at the poster's **Federal funding pathway** panel.
- If the dark feed banner is missed and the dock passes `+01:00`, press **Pause** and carry on. The twist event only adds a line to the latest event strip.

## Not in the video, for live Q&A

- **The audit log**: the **Audit log** tab in the header. After **Confirm hold** it opens filtered to `MSKU1234567`, with the planner line on top.
- **Rated orders**: in the dock, press **More controls**, then the **Rated orders** switch. Six boxes get a 03:00 gate out deadline and take their slots first. On the gate plan, five other boxes show as Slid in **No slot tonight**, each with the slot it lost.
- **Fake a reading**: on any box card, open **Demo: fake a reading** at the bottom, type 41,000 into **Carrier weight in lb**, and press **Send weight**. The weight conflict appears, carrier trust drops, and the step changes on the spot. In Rotterdam and Shanghai the field takes kilograms.
- **Silent reefer**: in the dock, press **More controls**. Under **Reefer fault**, pick a reefer, choose **Trip circuit**, and press **Apply**. Every unit on that circuit goes quiet, and Rung asks the reefer crew to check the breaker instead of sending a technician to each box.
- **The gate plan in another region**: switch the **Region** menu on the **Gate plan** tab. The plan, the 96 of 129, and the reefer counts stay the same. Fees and the CO2 label change.
- **The ladder in full**: on the Queue, press **How the ladder works** for every step, what it means at the gate, who acts, and how the votes are counted.

## The 30 second version

Set up first: press **Pause**, then **Crisis** in the dock, and open the **Gate plan** tab. The clock
jumps to 22:44 on Harbor Night with every scripted crisis event fired, and stays paused. On the
fourth sentence, click the **Queue** tab. The **Hand** step in the ladder reads 21.

> Container terminals close the gate when their data goes bad, and every truck in line pays for it.
> Rung reads five sources for every box, trusts each one as much as it has earned, and picks the
> gentlest safe step, from Release to Hand. Tonight half our lanes are down and the terminal feed is
> dark, and Rung still keeps 96 of 129 trucks moving. Only the 21 trucks due now go to a person. When
> the paperwork and the scale disagree, it calls the trucker with a voice agent and writes the answer
> into an audit log. The same engine runs in Rotterdam and Shanghai with only the edges changed, and it
> launches on an NSF SBIR Phase I grant.
## Judges Q&A

**Is any of this real data?**
Pier 7 and its 191 boxes are simulated with a fixed seed, so the demo is the same every time. The
voice call is real, through Retell. The Terminal49 integration is real code using Terminal49's field
names, but our key can only create tracking requests. Reads need a paid plan, so Rung runs in fixture
mode and badges every field simulated. Every field on screen says which it is.

**Is an AI making the decisions?**
No. The decisions come from 15 small rules, each one file with a one line reason. The engine is a
pure function: the same box at the same time always gets the same answer. The language model only
runs the phone conversation, and its result is one of four fixed outcomes.

**What prompt does the voice agent run?**
Press **Voice agent prompt** in the dock, or **See the agent prompt** on any box card. The drawer
shows the prompt, the six values filled in for each call, the tools the agent can use, and the
fields read back after the call. It comes from `GET /api/prompts`, which reads
`scripts/retell_setup.py`, the same script that creates the agent, so the two cannot drift apart.

**How would you fund it?** (Twist 1)
The primary path is an NSF SBIR Phase I grant, solicitation NSF 26-510: up to $305K over 6 to 18
months, Project Pitch first, with full proposal deadlines on Nov 4, 2026 and Mar 4, 2027. Phase I
proves trust calibration, the safe degraded mode, and re-slotting at terminal scale, in shadow mode
at a Port of Long Beach terminal. The alternatives are DoD SBIR, by asking USTRANSCOM and SDDC to
sponsor a port readiness topic, and MARAD's Port Infrastructure Development Program for the rollout,
with the port as lead applicant. Every program was checked on Oct 17, 2026. Partner names are targets.
Rung has no letters of support yet. The plan is in [funding-pathway.md](funding-pathway.md).

**Why NSF first, and not DoD?**
NSF funds across nearly all technology areas, so Rung needs no topic match, and it asks for
commercial impact first, which is the everyday Tuesday customer. We found no port or logistics topic
in DoD's FY27 Release 1, so DoD needs a sponsor first. Harbor Night is the dual use case that makes
that conversation possible.

**Does it work outside the US?** (Twist 2)
Yes. The ladder, `evaluate()`, trust, the five conflicts, the gate optimizer, human approval, and the
audit log never know which country they run in. A region profile changes only the edges: the data
adapters, units and currency, the customs authority and who owns a hold, and the time zone label.
`tests/test_regions.py` checks that every decision and the gate plan are identical in Los Angeles,
Rotterdam, and Shanghai, and that the engine and rule files never import the region code.

**Are Portbase and the China Single Window connected?**
No. They are named stubs, and the status line under the header says so. Terminal49 is the only live adapter.
The exchange rates are fixed demo rates, EUR at 0.86 and CNY at 7.1 per USD, labeled as such.
[global.md](global.md) covers what a real rollout needs, port by port, including Singapore and Lagos.

**Where is the poster?** (Twist 3)
`docs/poster/rung-poster.pdf`, one 24 by 36 inch portrait page, built from HTML and CSS by
`docs/poster/build.py`. Its numbers come from the app on Harbor Night at `+00:40`, the same numbers
in the demo, and its QR codes link to the code and the demo video.

**How did the twists land in the code?**
Each twist is a commit tagged `twist:` with its id, and the **Twist log** under **More controls** in
the dock reads them from git. It shows when each twist was received and merged, the files it added,
and the full diff.

**Is the CO2 number measured?**
No, it is modelled. Rung counts how long each booked truck idles at the gate under its plan and if the
terminal closed, and multiplies by 8.14 kg CO2 per idle hour: about 0.8 gallon of diesel an hour at
idle (DOE and Argonne, 2015) times 10.18 kg CO2 a gallon (EPA). The footnote on the Gate plan links
both sources. It never changes a decision.

**What if the voice agent mishears?**
An unclear answer is recorded as unknown, which keeps the conflict open and votes HOLD. Even a clear
answer only moves the box to HAND, so a person decides.

**Can Rung lift a customs hold or release a held box?**
No. HOLD in Rung means withholding the gate release for this one box, and RELEASE never lifts a hold.
Holds belong to the customs broker, the shipping line, or the terminal, and Rung names the owner on
every HOLD.

**How does trust work?**
Each source starts from a base reliability, halves on a fixed half life as its reading ages, and
loses 30 percent for each conflict it is part of. A trucker call that backs a source adds 0.20. Open
**Sources and trust** on a box card and hover any trust bar to see the arithmetic.

**What happens when a feed goes down?**
A dark source contributes nothing. Boxes that depend on it WATCH, and only boxes whose truck is due
at the gate go to HAND. At `+00:40` that is 21 boxes instead of more than 100. A red banner shows how
long the feed has been dark.

**How fast is the gate optimizer, and what does it optimize?**
It assigns every booking to a lane and window with scipy's `linear_sum_assignment`. The cost is delay
hours times (101 minus urgency), so urgent boxes wait least. Reefers and last free day boxes are
solved first. 129 bookings onto 96 slots solve in under 1 ms. The target was 100 ms.

**Why rules and not a model?**
A planner has to defend a hold to customs, a shipping line, and a trucker. A rule with a sentence
attached can be defended. A score cannot. New cases are new rule files, without retraining.

**How do you add a new kind of problem?**
Add one file in `backend/rules` with a test, a step, and a reason. A new port is a region profile and
its adapters, not a change to the engine.

**Can I try to break it?**
Yes. Every box card has **Demo: fake a reading**. Type a fake carrier weight or place a hold, and the
engine re-evaluates at once. Each spoof is in the audit log.

**What about refrigerated cargo specifically?**
Reefer warming and power loss drive urgency. On Harbor Night the card shows a warm up clock to the
loss limit. Frozen cargo follows the CSIRO 2007 figure. Chilled and produce use a 6 hour time constant
that the card labels as an assumption. When a reefer goes silent, Rung tells a tripped circuit from a
failed unit from a telemetry fault and asks the right crew.

**Is the transcript live during the call?**
It lands on the card when the call ends. Retell's current web transport does not stream it to the
browser. The outcome itself can land mid call, as soon as the agent records it.

**What would it take to run at a real terminal?**
The carrier, terminal, and customs sources already accept Terminal49's data as is. The weighbridge
and reefer monitoring are simulated here and would need adapters to the terminal's own systems. Phone
calls need a Retell number. Outside the US, the same adapter work applies to Portbase, the China
Single Window, or the local port community system.

**Does it need the internet?**
No. With no keys the whole scenario runs offline, including a scripted simulated call.
