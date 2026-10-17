# Rung demo pitch

A 3 minute pitch with a click by click run of show on the real app, a 30 second version, and a judges
Q&A sheet. Button and label names below are exactly as they appear on screen.

## Before you go on

1. Start the app with `make demo`. For the live call, set it up beforehand: `make tunnel` in a second terminal, `make retell-setup` once, then restart `make demo`. The steps are in the [README](../README.md#a-live-retell-call).
2. Open http://127.0.0.1:8000 in a browser sized for the projector, 1280 by 720 or larger.
3. Make one test call on any box, so the browser has already granted the microphone. Then press **Reset**.
4. Set **Speed** to **Paused**. The header should read Tuesday, 22:00, `+00:00`, Lanes open 6 of 6.
5. Open a box card and check the Ask the trucker badge reads **Retell web**. If it reads **Simulated**, no Retell key is loaded, and the call will be the scripted one. That still works: pick Confirmed loaded under Trucker answer before you press Ask.
6. Close every terminal and editor window. Never put `.env` or a terminal on the projector.

The live call needs someone to play the trucker, Dana Ruiz of Pacific Coast Dray. The presenter can
do it, or a teammate next to the laptop microphone. The lines:

- "Yes, this is Dana Ruiz with Pacific Coast Dray."
- "Yes, it is loaded. The shipper added pallets at the last minute."
- "Okay, thank you. Goodbye."

## The 3 minute pitch

### 0:00 The problem

Screen: the Queue tab, Tuesday, clock paused at 22:00.

> Every truck that leaves a container terminal goes through a gate, and a yard planner decides which
> boxes go. For every box, five systems have an opinion: the shipping line's manifest, the terminal,
> customs, the scale, and the reefer plug. They disagree all the time, and the data goes stale. On a
> bad night the safe move is to close the gate. That strands every trucker in line, every reefer that
> needs to leave, and every box about to run into demurrage.

### 0:20 Tuesday at Pier 7

Screen: the Queue. Point at the Tuesday chip, Lanes open 6 of 6, and Throughput 90%.

> This is Rung at Pier 7, a terminal in San Pedro Bay. 191 boxes are waiting. For every box Rung reads
> all five sources, works out how much to trust each one, and puts the box on a ladder: Release,
> Watch, Ask, Slow, Hold, Hand. Most boxes are clean, so most say Release. A few say Ask.

Click: the **Step** filter, then **ASK**. Two rows remain. Click **CMAU9939083**.

### 0:40 The ask call

Screen: the box card for `CMAU9939083`. The step chip says ASK. Point at the conflict "Manifest 36,000
lb, weighbridge 40,500 lb, gap 12.5 percent" and at the trust bars for carrier and weighbridge.

> The manifest says 36,000 pounds, the scale says 40,500. That is more than 12 percent apart. Either
> the paperwork is wrong or there is cargo nobody declared. Rung does not guess. It asks. Rung's voice
> agent will call the trucker right now.

Click: **Ask** in the Ask the trucker section. The status reads Connecting, then On the call.

The agent introduces itself as the Pier 7 gate desk, checks it has Dana Ruiz, reads both weights, and
asks whether the box is loaded as weighed. The trucker answers with the three lines above. Keep the
answers short, and wait for the agent to finish each turn.

When the call ends, the transcript lands on the card and the outcome reads Confirmed loaded. The step
moves to HAND, with **Decide** on the card, and weighbridge trust rises.

> The trucker backed the scale. Rung raises its trust in the weighbridge, and because the manifest is
> now known to be wrong, the box goes to Hand: a person decides, with the call on the record. That
> was a real call, through Retell, and the agent wrote the answer straight back into Rung.

If the call is still going at 1:30, keep talking. The outcome lands as soon as the agent records it.

### 1:30 Harbor Night

Click: the **Gate** tab. Then set **Speed** to **1 min/s**. Every scenario minute now takes one real
second, and the scripted events fire on their own.

> Same app, same code, different night.

- At `+00:05` the header turns dark blue and the chip reads **Harbor Night**.
- At `+00:10` lanes 4 to 6 close. The header reads Lanes open 3 of 6, and lanes 4 to 6 turn grey on the grid and read Closed. The moved and overflow lists fill, and the solve time reads under 1 ms.

> Half the gate just went down. Rung re-plans every booked truck as an assignment problem, reefers and
> last free day boxes first. 47 trucks move to a new slot, in under a millisecond.

- At `+00:20` a customs hold lands on `TCLU7654321`. Rung does not argue with customs. That box goes to HOLD.
- At `+00:40` the red **Dark feed** banner appears: Terminal feed dark.

> And now the terminal's own data feed goes dark. Rung does not stop. Boxes that depend on that feed
> wait, and only the trucks due at the gate right now go to the planner.

Click: **Speed**, then **Paused**, as soon as the banner shows.

Point at **Rung against closing the terminal**: appointments kept 96 of 129 against 0 of 129, and every
reefer and every last free day box kept.

### 2:15 The box that matters

Click: the **Queue** tab, the **Step** filter, then **HOLD**. Click **MSKU1234567**.

Screen: the box card. HOLD, Planner tap, Owner: customs broker, urgency 95. Point at the conflicts
list, the reason in large text, and the Warm up clock in the reefer panel.

> This one is chilled beef, under a customs hold, with the power off since nine o'clock, and it is
> warming. Releasing it is not ours to give. Customs owns that. So Rung says Hold, names the owner, and
> attaches the reefer evidence for the broker. The planner taps once.

Click: **Approve** next to the step chip.

### 2:40 The audit log and the close

Click: the **Audit log** tab. It opens filtered to `MSKU1234567`, with the planner line on top.

> Every step, every call, every override lands here with its reason in plain sentences. Rung never
> places a hold and never lifts one. It never releases a box on a guess, and a person signs every hard
> call. On the worst night of the year Rung kept 96 of 129 trucks moving. Closing the gate keeps zero.
> That is Rung.

### If you have an extra minute

- **Rated orders**: on the Gate tab, flip the **Rated orders** switch in the header. Six boxes get a 03:00 gate out deadline and take their slots first. Five other boxes show as Slid in overflow, each with the slot it lost.
- **Spoof input**: on any box card, type 41,000 into Carrier weight in lb and press **Send weight**. The weight conflict appears, the carrier trust bar drops, and the step changes on the spot.
- **Silent reefer**: in the header reefer picker, choose a reefer, pick **Trip circuit**, and press **Apply**. Every unit on that circuit goes quiet, and Rung asks the reefer crew to check the breaker instead of sending a technician to each box.

## The 30 second version

Set up first: **Reset**, **Speed** at **1 min/s**, the **Gate** tab open, and wait for the dark feed
banner at `+00:40`. Then set **Speed** to **Paused**.

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

**What if the voice agent mishears?**
An unclear answer is recorded as unknown, which keeps the conflict open and votes HOLD. Even a clear
answer only moves the box to HAND, so a person decides.

**Can Rung lift a customs hold or release a held box?**
No. HOLD in Rung means withholding the gate release for this one box, and RELEASE never lifts a hold.
Holds belong to the customs broker, the shipping line, or the terminal, and Rung names the owner on
every HOLD.

**How does trust work?**
Each source starts from a base reliability, halves on a fixed half life as its reading ages, and
loses 30 percent for each conflict it is part of. A trucker call that backs a source adds 0.20.
Hover any trust bar to see the arithmetic.

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
works that way, and the Twist log shows its git diff.

**Can I try to break it?**
Yes. Every box card has a Spoof input. Type a fake carrier weight or toggle a hold, and the engine
re-evaluates at once. Each spoof is in the audit log.

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
