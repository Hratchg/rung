# Rung demo pitch

A pitch that fits in 2:50 with the live voice call, a click by click run of show on the real app, a
30 second version, and a judges Q&A sheet. Button and label names below are exactly as they appear on
screen. Planner controls sit in the app itself. Everything that drives the scenario sits in the
dashed amber **Demo controls** dock at the bottom of the screen.

## Before you go on

1. Start the app with `make demo`. For the live call, set it up beforehand: `make tunnel` in a second terminal, `make retell-setup` once, then restart `make demo`. The steps are in the [README](../README.md#a-live-retell-call).
2. Open http://127.0.0.1:8000 in a browser sized for the projector, 1280 by 720 or larger.
3. Make one test call on any box, so the browser has already granted the microphone. Then press **Reset** in the dock.
4. In the dock, press **Pause** next to **Minutes per second**. The header should read Tuesday, 22:00, Lanes open 6 of 6, and the dock should read Scenario `+00:00`.
5. Open `CMAU9939083` and check the chip in the **Call the trucker** panel. **Retell web call** means the live agent is loaded. **Simulated call** means no Retell key is loaded and the call will be the scripted one. That still works: leave **The simulated trucker answers** on **Trucker backs the scale**.
6. Close every terminal and editor window. Never put `.env` or a terminal on the projector.
7. Rehearse the call once with a stopwatch. With the three trucker lines below it runs about 40 seconds. If it runs longer, use the cut rules at the end of the run of show.

The live call needs someone to play the trucker, Dana Ruiz of Pacific Coast Dray. The presenter can
do it, or a teammate next to the laptop microphone. Keep each answer short and wait for the agent to
finish its turn. The lines:

- "Yes, this is Dana Ruiz with Pacific Coast Dray."
- "Yes, it is loaded. The shipper added pallets at the last minute."
- "Okay, thank you. Goodbye."

## Run of show

| Start | Beat | Length |
| --- | --- | --- |
| 0:00 | The problem | 15 s |
| 0:15 | Tuesday: the queue and the ladder | 18 s |
| 0:33 | The live ask call | 57 s |
| 1:30 | The voice agent prompt | 18 s |
| 1:48 | Harbor Night: the gate plan | 34 s |
| 2:22 | The box that matters | 17 s |
| 2:39 | The audit log and the close | 11 s |
| 2:50 | End | |

### 0:00 The problem (15 s)

Screen: the Queue, Tuesday, clock paused at 22:00.

> Every truck that leaves a container terminal goes through a gate. Five systems describe every box,
> and they disagree all the time. On a bad night the safe move is to close the gate, and every truck
> in line pays for it.

### 0:15 Tuesday: the queue and the ladder (18 s)

Screen: the Queue. Point at the headline **34 boxes need your decision**, then sweep left to right
across the ladder: Release, Watch, Ask, Slow, Hold, and Hand set apart on the right.

> This is Rung at Pier 7. 191 boxes are waiting. Rung reads all five sources for each one and puts it
> on the gentlest safe step of this ladder, from Release on the left to Hand, where a person decides.

Click: the **Ask** step in the ladder. Two rows remain. Click **CMAU9939083**.

### 0:33 The live ask call (57 s)

Screen: the box card. The big card reads **Rung recommends ASK, Get fresher facts** and **The weights
disagree. Get a reweigh or call the trucker before it leaves.**

> The manifest says 36,000 pounds. The scale says 40,500. Rung does not guess. It asks. Its voice
> agent calls the trucker right now.

Click: **Call the trucker** in the **Call the trucker** panel. The status reads Connecting, then On the
call.

The agent introduces itself as the Pier 7 gate desk, checks it has Dana Ruiz, reads both weights, and
asks whether the box is loaded as weighed. The trucker answers with the three lines above.

When the agent records the answer, the outcome box reads **Trucker backs the scale** and the big card
turns violet: **HAND, You decide now**, with **The trucker backed the scale, so the manifest is wrong.
You decide what happens to this box.** The button under **Your move** now reads **Decide**.

> The trucker backed the scale, so the manifest is wrong. Rung will not pick a side on its own. A
> person decides, with the call on the record. That was a real call, through Retell.

### 1:30 The voice agent prompt (18 s)

Click: **See the agent prompt**, next to **Call again** in the same panel. The **Voice agent prompt**
drawer opens. Scroll slowly from **Identity** down to **Weight check call** and its four outcomes.

> This is the exact prompt that agent ran, read live from our setup script. Who it is, how to say a
> container number, the weight check steps, and the only four answers it may record. The model runs
> the conversation. Rung's rules decide what happens next.

Press **Escape** to close the drawer.

IBM Bob prompts: placeholder, pending confirmation that Bob was used. If it was, show the Bob prompts
here for at most 10 seconds and take the time from the close.

### 1:48 Harbor Night: the gate plan (34 s)

Click: the **Gate plan** tab. Then press **2** next to **Minutes per second** in the dock. Every
scenario minute now takes half a real second, and the scripted events fire on their own.

> Same app, same code, the worst night of the year.

- After 3 seconds the header turns dark blue and the chip reads **Harbor Night**.
- After 5 seconds lanes 4 to 6 close. The header reads Lanes open 3 of 6, Closed 4 to 6, and the headline reads **Lanes 4 to 6 are closed. Rung keeps 96 of 129 trucks moving and saves 89 idle hours and 725 kg of CO2.**
- After 10 seconds a customs hold lands on `TCLU7654321`.
- After 20 seconds the red **Terminal feed dark** banner appears. Press **Pause** right away.

Say the first line while the events fire, and the rest after **Pause**.

> Half the gate went down, customs placed a hold, and the terminal feed went dark. Rung re-planned
> every truck in under a millisecond. It keeps 96 of 129 trucks moving and every reefer, and by our
> model it saves about 750 kilograms of CO2 from trucks idling at the gate.

Point at the four cards under the headline: Rung 96 against Closed terminal 0, reefers 20 of 20, last
free day boxes 28 of 28, and truck idle CO2. At the pause the headline reads about 92 idle hours and
750 kg. The plan changes as the night moves, so these numbers drift by a few kg.

### 2:22 The box that matters (17 s)

Click: the **Queue** tab, the **Hold** step in the ladder, then **MSKU1234567**.

Screen: the big card reads **HOLD, Waits for its owner** and **Keep this truck at the gate until the
customs broker clears it. The reefer evidence goes with it.** The amber reefer card below it reads
**Product passed 2.6 C at 21:53**.

> Chilled beef, under a customs hold, power off since nine. Releasing it is not ours to give. Rung
> says Hold, names the owner, and attaches the reefer evidence. The planner taps once.

Click: **Confirm hold** under **Your move**.

### 2:39 The audit log and the close (11 s)

Click: the **Audit log** tab in the header. It opens filtered to `MSKU1234567`, with the planner line on
top.

> Every step, call, and override lands here with its reason, and a person signs every hard call.
> That is Rung.

### Cut rules

- If the call outcome has not landed by 1:35, keep talking over the hero card until it does, then skip the prompt drawer scroll and only open and close it.
- If the clock reads 2:30 or later when you reach the box that matters, skip **Confirm hold** and the audit log, and say the close line on the box card.
- If the dark feed banner is missed and the dock passes `+01:00`, press **Pause** and carry on. The twist event only adds a line to the latest event strip.

## Not in the video, for live Q&A

- **Rated orders**: in the dock, press **More controls**, then the **Rated orders** switch. Six boxes get a 03:00 gate out deadline and take their slots first. On the gate plan, five other boxes show as Slid in **No slot tonight**, each with the slot it lost.
- **Fake a reading**: on any box card, open **Demo: fake a reading** at the bottom, type 41,000 into **Carrier weight in lb**, and press **Send weight**. The weight conflict appears, carrier trust drops, and the step changes on the spot.
- **Silent reefer**: in the dock, press **More controls**. Under **Reefer fault**, pick a reefer, choose **Trip circuit**, and press **Apply**. Every unit on that circuit goes quiet, and Rung asks the reefer crew to check the breaker instead of sending a technician to each box.
- **The ladder in full**: on the Queue, press **How the ladder works** for every step, what it means at the gate, who acts, and how the votes are counted.

## The 30 second version

Set up first: **Reset**, press **2** next to **Minutes per second**, open the **Gate plan** tab, and wait
for the **Terminal feed dark** banner. Then press **Pause**.

> Container terminals close the gate when their data goes bad, and every truck in line pays for it.
> Rung reads five sources for every box, trusts each one as much as it has earned, and picks the
> gentlest safe step, from Release to Hand. Tonight half our lanes are down and the terminal feed is
> dark, and Rung still keeps 96 of 129 trucks moving, every reefer included. When the paperwork and
> the scale disagree, it calls the trucker with a voice agent and writes the answer into an audit
> log. The planner signs every hard call.

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
Add one file in `backend/rules` with a test, a step, and a reason. During the hackathon each twist
works that way, and the **Twist log** under **More controls** shows its git diff.

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
calls need a Retell number.

**Does it need the internet?**
No. With no keys the whole scenario runs offline, including a scripted simulated call.
