# How Rung works

Rung decides, box by box, what the gate should do with each container waiting to leave Pier 7. It
reads five sources about every box, decides how much to trust each one, finds where they disagree,
scores how much waiting costs, and lets a set of small rules vote on a step from a six step ladder.
The strongest vote wins, a plain language reason is assembled from the rules that fired, and the
planner approves or overrides. Nothing is a black box: every number on screen can be traced to a
formula on this page, and every decision is in the audit log.

## What is live and what is simulated

Pier 7 is fictional, so most of the yard is simulated. The integrations are real code, and one of
them runs live today.

| Part | Status |
| --- | --- |
| Voice ask call through Retell | Live when `RETELL_API_KEY` and `RETELL_AGENT_ID` are set. A real web call in the browser, a real LLM voice agent, real custom function calls back into Rung through a public tunnel, and real call ids in the audit log. Verified end to end. With no key, a scripted simulated call plays instead |
| Terminal49 container data (carrier, terminal, customs) | Live capable. The poller, the field mapping, and the fixture fallback are real code using Terminal49's field names unchanged. The key we have can only create tracking requests. Reads need a paid plan, so Rung runs in fixture mode and every one of these fields is simulated |
| Weighbridge readings | Simulated only |
| Reefer telemetry: temperatures, power, circuit, draw, alarms, silences | Simulated only, with a physical warm up model |
| The 191 boxes, their appointments, and the scenario events | Simulated from `scenario.json` with a fixed seed |
| Decision engine, rules, gate optimizer, audit log | Real and deterministic. They behave the same on live data |

Every field in the UI carries a badge, live or simulated, so the screen never hides which is which.

## Reading the screen

The UI is built to be read from across a room at 1280 by 720. Every status color comes with a text
label, and rule and conflict ids such as R3 or C1 stay as secondary detail behind plain words. The
[UI guide](ui-guide.md) walks through every screen with annotated screenshots and explains every term.

- **Header**, in three rows. The first says where you are: Rung, Gate triage at Pier 7, the **Region** menu (Los Angeles, Rotterdam, or Shanghai), the night (Tuesday or Harbor Night), the scenario clock with its time zone label, lanes open, and the three screens, **Queue**, **Gate plan**, and **Audit log**. The second row is **Tonight so far**: Released, Reefers powered, Reefers lost, Fees avoided, Bookings kept, and Truck idle in hours and kg CO2, marked modelled. The third shows the latest scenario event on the left and where the data comes from on the right. A red banner sits above it while a feed is dark.
- **Queue**. The headline counts the boxes that need a decision. Under it the ladder strip shows the six steps gentlest first, each with its count and a short meaning, and Hand set apart on the right. Click a step to filter. **How the ladder works** explains every step and how the votes are counted. Each row leads with plain words such as Weight mismatch or Hold by customs broker, and has one main button named for the action.
- **Box card**. The big card says what Rung recommends, the next step in one sentence, the owner, the urgency, and where the step sits on the ladder, with **Your move** on the right. The call panel and the reefer card follow when they matter, then **Why Rung says** with the rule votes next to **Where the sources disagree**. Sources and trust, the full reason, the decision history, and the demo spoof form stay collapsed until opened.
- **Gate plan**. The headline compares Rung against closing the terminal, in trucks kept, idle hours, and kg CO2. The lanes by hour grid follows with an icon key, then **Moved to a new slot** and **No slot tonight**.
- **Demo controls**. A dashed amber dock at the bottom holds everything that drives the scenario: **Reset**, **Minutes per second**, the next scripted event, **Voice agent prompt**, and **More controls** with the event buttons, reefer faults, rated orders, the scripted timeline, and the twist log. None of it is part of the planner's app.

## Architecture

One process on one port. FastAPI serves the JSON API and the built Vite app from the same origin, so
there is no CORS setup and no second server in the demo.

```
Browser: React, TypeScript, Tailwind, TanStack Query, shadcn/ui on Radix
  polls GET /api/state, /api/queue, /api/box, /api/gate, /api/audit every 2 seconds
  reads GET /api/prompts once, when the voice agent prompt drawer opens
        |
        |  same origin
        v
uvicorn backend.main:app, one port
  Scenario      in memory, rebuilt from scenario.json on reset. Clock, events, 191 boxes
  Engine        evaluate(box, now), pure. Rules from backend/rules, R0 to R14
  Gate solver   scipy linear_sum_assignment, greedy fallback
  Audit         audit.jsonl plus a 5000 line ring buffer
  Task          Terminal49 poller every 60 seconds, or the fixture
  Task          Retell call poller every 3 seconds while a call is open
  Static        frontend/dist
        ^
        |  POST /api/retell/lookup and /api/retell/record, signed by Retell
Retell voice agent "Pier 7 gate desk", through PUBLIC_BASE_URL (a cloudflared quick tunnel)
```

- State lives in memory. There is no database. Reset rebuilds everything from `scenario.json`.
- Every API request first advances the scenario clock, fires any scripted events it passed, and re-evaluates every box still in the yard. A box gets a new audit line only when its decision changes.
- `evaluate(box, now)` is pure: no clock reads, no randomness, no I/O. The same box at the same time always gets the same decision. Randomness exists only when the synthetic population is generated, with seed 7.
- The two background jobs are plain asyncio tasks started in the FastAPI lifespan. There are no websockets and no job framework.

## The scenario

The clock starts at 22:00 on Oct 18 and runs one scenario minute per real second by default. The
**Minutes per second** buttons in the Demo controls dock offer Pause, 1, 2, 5, and 10.

The yard holds 191 boxes: the one hand written Harbor Night box `MSKU1234567` from the spec, plus 190
synthetic boxes. The synthetic boxes have valid ISO 6346 numbers, 15 percent are reefers (frozen at
minus 18 C, chilled meat at minus 1.4 C, produce at plus 10 C), 8 percent carry a hold (one in five of
them pending), last free days run from yesterday to six days out, and past due boxes accrue demurrage
at 440 USD a day for reefers and 275 USD for dry boxes. Two boxes carry a planted weight conflict.
`CMAU9939083` is the heavy one: manifest 36,000 lb, weighbridge 40,500 lb. Six lanes run eight hourly
windows from 22:00 to 05:00 with four trucks per lane per window.

Scripted events, as offsets from 22:00:

| Time | Event | What it does |
| --- | --- | --- |
| `+00:05` | `mode harbor_night` | The header turns dark blue and the chip reads Harbor Night |
| `+00:10` | `lanes_down 4 5 6` | Half the gate closes. Boxes booked on those lanes go to SLOW and the gate re-solves |
| `+00:20` | `hold_placed TCLU7654321` | A new customs hold. That box goes to HOLD, owner customs broker |
| `+00:25` | `reefer_power_off MSKU1234567` | Logged as a no op, because the spec data has that unit off since 21:00 |
| `+00:40` | `source_dark terminal` | The terminal feed goes dark. The dark feed banner appears |
| `+01:00` | `twist` | A placeholder for a hackathon twist |

**More controls** in the Demo controls dock fires the same events by hand: Close lanes 4 to 6,
Customs hold on TCLU7654321, Cut terminal feed, and the **Reefer fault** picker with Cut power, Trip
circuit, Drop telemetry, and Fail the unit. The same controls exist as API calls:

```bash
curl -X POST localhost:8000/api/scenario/reset
curl -X POST localhost:8000/api/scenario/speed -H 'Content-Type: application/json' -d '{"minutes_per_second": 0}'
curl -X POST localhost:8000/api/scenario/jump  -H 'Content-Type: application/json' -d '{"t": "+00:40"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_power_off", "box": "MSKU1234567"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "circuit_trip", "circuit": "R4"}'
curl -X POST localhost:8000/api/scenario/event -H 'Content-Type: application/json' -d '{"type": "reefer_silent", "box": "HLBU8714647", "alarm": "compressor fault"}'
curl -X POST localhost:8000/api/scenario/rated -H 'Content-Type: application/json' -d '{"on": true}'
curl -X POST localhost:8000/api/box/CMAU9939083/spoof -H 'Content-Type: application/json' -d '{"weight_in_lbs": 41000}'
curl -X POST localhost:8000/api/gate/lanes     -H 'Content-Type: application/json' -d '{"lane": 4, "open": false}'
curl 'localhost:8000/api/audit?box=MSKU1234567&limit=20'
```

## The five sources and trust

| Source | Fields | Where it comes from | Base | Half life | Dark after |
| --- | --- | --- | --- | --- | --- |
| carrier | weight, equipment type and length, status, seal, arrival and discharge times | Terminal49 container object, or simulated | 0.75 | 24 h | 72 h |
| terminal | available for pickup, last free day, fees, yard location, appointment, line, freight and TMF holds | Terminal49, or simulated | 0.85 | 4 h | 12 h |
| customs | customs, USDA, and VACIS holds | Terminal49 holds, or simulated | 0.95 | 12 h | 36 h |
| weighbridge | measured weight, method | Simulated only | 0.90 | 2 h | 6 h |
| reefer | set point, air and product temperature, power, circuit, draw, alarm | Simulated only, hourly with dropouts | 0.90 | 1 h | 3 h |

Trust in a source for one box:

```
trust = base × 0.5 ^ (age_hours / half_life_hours) × 0.7 ^ (conflicts this source is part of)
```

So trust fades as a reading ages, and drops by 30 percent for every conflict the source is caught in.
If a trucker call backs one side of a weight conflict, that source gains 0.20, capped at 0.99. Open
**Sources and trust** on the box card and hover a trust bar to see the arithmetic, for example "terminal: base 0.85, age 11 min,
freshness 0.97, 1 conflict, trust 0.58". The bar also has a text level: None, Low under 0.3, Medium
under 0.6, High otherwise.

A source is dark when its newest reading is older than its dark threshold, or when the scenario marks
it dark. A dark source gets trust 0 and contributes no readings. The card still shows its last known
values, dimmed and marked unused.

## Conflicts C1 to C5

| Code | Fires when | Sentence on the card |
| --- | --- | --- |
| C1 weight | The carrier weight and the weighbridge differ by more than 3,000 lb or 12 percent, whichever is larger, or the carrier says empty and the scale reads over 8,000 lb | "Manifest 36,000 lb, weighbridge 40,500 lb, gap 12.5 percent." |
| C2 sync | The terminal says available while a hold is active, or not available with no hold at all | "Availability and holds disagree. Terminal data 20 min old." |
| C3 reefer | Power off, product more than 2 C over set point, or the unit silent for over 2 h | "Reefer power off and warming: product 2.9 C against set point minus 1.4 C." |
| C4 dark | Any source past its dark threshold | "Terminal has not reported for 1 h." |
| C5 clock | Last free day within 24 h and not available, or demurrage already accruing | "Last free day Oct 19. Demurrage 440 USD accruing." |

A trucker who confirms the box is empty, matching the manifest, clears C1.

## Urgency

Urgency is a cost of waiting score from 0 to 100, capped.

| Component | Points |
| --- | --- |
| Reefer product temperature over set point | Up to 40, linear from 0 to 4 C over. Frozen cargo at half rate |
| Reefer power off on chilled or produce cargo | 40 |
| Last free day within 24 h, 48 h, 72 h | 30, 20, 10 |
| Demurrage already accruing | 15 |
| Active customs, USDA, or VACIS hold | 15 |
| Active line, freight, or TMF hold | 10 |
| Pending hold | 5 |
| Appointment within 2 h | 10 |
| Rated order, while rated order mode is on | 50 |

The queue sorts by urgency, then by step strength, then by last free day. Boxes pinned by R5, R11, or
R13 go to the top of the RELEASE group.

## The ladder and the rules

| Step | Gate meaning | Who acts |
| --- | --- | --- |
| RELEASE | No conflict, cleared, dispatch at its slot | Planner confirms with one tap |
| WATCH | Do nothing yet, recheck at the next poll | Nobody |
| ASK | Get fresher information: re-poll the record, request a reweigh, or call the trucker | System or voice agent |
| SLOW | Keep it moving, later or in another lane | Optimizer |
| HOLD | Withhold the gate release for this box only, pending an outside owner | Planner approves |
| HAND | A person must decide now | Planner |

HOLD never places a customs, line, or freight hold, and RELEASE never lifts one. Those belong to the
customs broker, the shipping line, or the terminal. Rung only decides whether this truck leaves the
gate now.

Each rule is one file in `backend/rules/` with a test, a step, a one line reason, and a `created_at`
time. Rules load in id order.

| Rule | Fires when | Votes |
| --- | --- | --- |
| R0 clear | No conflicts, no active holds, available | RELEASE |
| R1 recheck | C2 and urgency under 50 | WATCH |
| R2 refresh | C2 and urgency 50 or more | ASK, re-poll the terminal record |
| R3 verify weight | C1 | ASK, call the trucker and request a reweigh |
| R4 weight unresolved | C1 still open after an ask, and urgency 50 or more | HOLD and hand, owner shipping line |
| R5 reefer priority | C3 with no active hold | RELEASE, pinned to the top |
| R6 reefer under hold | C3 with an active customs or line hold | HOLD and hand, owner of that hold, reefer evidence attached |
| R7 hold owner | Any active hold | HOLD, owner of the hold |
| R8 pending hold | A pending hold | WATCH, with a heads up note to the owner |
| R9 lanes down | The appointment lane is closed | SLOW, the optimizer assigns a new slot |
| R10 dark | C4 on a source this box depends on | WATCH, or HAND if the box was pending release |
| R11 clock | C5 and otherwise clear | RELEASE, pinned |
| R12 call outcome | C1 and a trucker call outcome | HAND if confirmed loaded, SLOW if a reschedule was accepted, HOLD if unknown. Owner shipping line |
| R13 rated order | A rated box that is otherwise clear | RELEASE, pinned |
| R14 silent reefer | A reefer has gone silent | ASK, owner reefer crew, with one text per silence class |

How a decision is made:

1. Every rule whose test passes votes for a step.
2. The strongest vote wins, in the order HAND, HOLD, SLOW, ASK, WATCH, RELEASE. A RELEASE vote can never beat a safety vote, so a rated box with a weight conflict still gets ASK.
3. If no rule fires, the box gets WATCH. That fallback covers boxes such as one with unknown availability.
4. On a HOLD the owner is the owner of the active hold. Otherwise it comes from a fired rule that names one, preferring a rule that voted for the winning step.
5. The reason joins each fired rule's sentence with the conflict sentences it used, then the step sentence and the owner. For example: "Reefer power off and warming: product 2.9 C against set point minus 1.4 C. Reefer in trouble under a customs hold. Release is not ours to give. Customs hold active (CBP HOLD). Gate release withheld. Escalated to planner with reefer evidence. Owner: customs broker."

"Depends on" means terminal and customs for every box, plus reefer for a reefer. Carrier and
weighbridge feed only the weight check. "Pending release" means the last step was RELEASE and the
truck is due, from 1 h after its window start to 2 h before it. That keeps HAND for trucks at the gate
now when the terminal goes dark: at `+00:40`, 21 boxes go to HAND and the rest WATCH, instead of more
than 100 boxes landing on the planner at once.

Decisions the spec left open are recorded in the phase reports. The one with the most effect: R0 has
no urgency gate. A clean, available box releases at any urgency and still sorts by urgency.

## HAND, planner actions, and the audit log

The hand flag means a planner must tap before the gate acts. It is set when any fired rule says HAND,
when the step is HOLD, or when the step is RELEASE after a conflict or a trucker call. The queue row
and the box card show a violet **Needs you** chip.

Every row and every box card has one main button, named for what it does, plus **Change step**.

| Button | When | What it does |
| --- | --- | --- |
| Release truck | Step RELEASE | Gates the box out. It leaves the queue and counts toward Released and Fees avoided |
| Keep watching | Step WATCH | Confirms the engine. Nothing happens at the gate yet |
| Book new slot | Step SLOW | Books the box into the slot the optimizer planned |
| Confirm hold | Step HOLD | Confirms the engine. The truck stays at the gate until the owner clears the hold |
| Pull fresh record, Request reweigh, Alert reefer crew | Step ASK | Re-polls the terminal for C2, sends a reweigh request for C1, or asks the reefer crew for R14 |
| Decide | Step HAND | Opens the step picker. HAND has no default, so a person must choose |
| Change step | Any step | Pick a different step and leave a note for the audit log |

Every decision change is one JSON line in `audit.jsonl` and in a 5000 line ring buffer:

```json
{"seq": 388, "ts": "2026-10-18T22:51:00-07:00", "box": "CMAU9939083", "step": "HAND", "hand": true,
 "previous_step": "ASK", "fired": ["R3", "R10", "R12"], "conflicts": ["C1", "C4"], "urgency": 10,
 "trust": {"carrier": 0.5, "terminal": 0.0, "customs": 0.86, "weighbridge": 0.56, "reefer": 0.0},
 "reason": "Manifest 36,000 lb, weighbridge 40,500 lb, gap 12.5 percent. Weight does not match the manifest. Call the trucker and request a reweigh. Terminal has not reported for 1 h. The terminal feed is dark and this box depends on it. Trucker confirmed the box is loaded as the scale weighed it. The manifest weight is wrong. A planner must decide now. Owner: shipping line.",
 "owner": "shipping line", "actor": "engine", "override": false, "note": "", "twist_tag": null}
```

That line is the engine's answer to a live call outcome: R12 fired, weighbridge trust rose by 0.20,
and the step went from ASK to HAND.

The actor is `engine` for automatic changes, `planner` for a button press, `voice` for a call start
or outcome (with the call id), and `spoof` for a judge's fake reading. A planner line has
`override: true` when the chosen step differs from the engine's. The Audit log tab shows the lines
newest first with a box filter, and each box card shows its own history.

## The gate optimizer

`backend/gate.py` re-plans every booked truck whenever lanes, holds, or urgencies change.

- Slot units are every lane, window, and truck position over open lanes only, and only windows that have not ended. Six lanes give 192 units. With lanes 4 to 6 down there are 96 for 129 bookings.
- The cost of putting a booking in a unit is the delay in hours times (101 minus urgency), so an urgent box pays more for every hour it waits.
- A window earlier than the booking, a HOLD box, or a closed lane costs a flat 1e6, never infinity. Pairs that carry it are dropped, so a box with no feasible unit lands in overflow, ordered by urgency.
- `scipy.optimize.linear_sum_assignment` solves the rectangular matrix in two tiers. Protected boxes go first: reefers, boxes at or past their last free day, and rated orders while that mode is on, none of them on HOLD. The rest take the units left. That is why every reefer and every last free day box keeps a slot when half the gate closes.
- The result is diffed against the booking to give the moved list, each with a one line reason such as "Lane 5 closed. Moved from 01:00 lane 5 to 02:00 lane 2."
- If scipy fails, a greedy urgency sort takes over and the Gate screen says so.

At `+00:10`, with lanes 4 to 6 closed, it moves 47 trucks and overflows 20 in under 1 ms. The target
was 100 ms. The headline of the Gate plan screen compares Rung against the blunt move of closing the
terminal, for example "Lanes 4 to 6 are closed. Rung keeps 96 of 129 trucks moving and saves 89 idle
hours and 725 kg of CO2." Four cards under it show trucks kept on the gate plan (96 of 129 against 0),
reefers kept, last free day boxes kept, and truck idle at the gate tonight in kg CO2 and hours. A line
below them compares bookings kept, released so far, and reefers lost. See [Emissions](#emissions).

## Emissions

Rung limits delays and costs, and it counts emissions too: the CO2 trucks burn idling at the gate.
Every idle number uses one factor, `KG_CO2_PER_IDLE_HOUR` in `backend/emissions.py`, 8.144 kg CO2
per truck idle hour.

- A heavy duty diesel truck burns about 0.8 gallon of diesel an hour at idle. DOE and Argonne National Laboratory, [Long-Haul Truck Idling Burns Up Profits](https://afdc.energy.gov/files/u/publication/hdv_idling_2015.pdf), 2015.
- A gallon of diesel makes 10,180 g of CO2. EPA, [Greenhouse Gas Emissions from a Typical Passenger Vehicle](https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle), the factor from 40 CFR 600.113.
- 0.8 times 10.18 is 8.144. EPA and ORNL measured 8.224 kg CO2 an hour on nine idling Class 8 trucks (SAE 2003-01-0288), a close cross check.

Idle hours come from the gate plan. Each booked truck reaches the gate at the start of the window it
was first booked for, and idles until it gets through or gives up. It gives up after one hour, the
length of an appointment window and the hour after which Rung stops counting a truck as due.

| Case | Idle for that truck |
| --- | --- |
| Kept in its booked hour, in any lane | 0 |
| Moved to a later slot: SLOW, a closed lane, or a full lane | New slot start minus booked start, at most 1 h |
| No open slot tonight (overflow) | 1 h, then turned away |
| HOLD | 1 h, then turned away |
| WATCH, ASK, or HAND on a dark feed it depends on, once its slot has started | The minutes it has waited since its slot started or the feed went dark, whichever is later. Nobody knows when the feed returns, so Rung does not guess |

WATCH, ASK, and HAND for other reasons are taken to settle within the slot, because a re-poll, a
reweigh, or a call takes minutes. The blunt move closes the terminal without a new plan, so every
booked truck still comes and waits out its hour. "So far" counts the minutes each truck has already
spent. A truck's idle is frozen when it gates out or its window ends, so the count never drops.

| Where | Fields |
| --- | --- |
| `/api/queue` rows and `/api/box/{number}` | `idle`: expected `minutes`, `co2_kg`, `so_far_minutes`, `cause`, `settled`, and a `label`. Null when no truck is booked |
| `/api/state` | `idle_hours` and `idle_co2_kg` so far tonight in `counters` and `counters_blunt`, and the factor with its sources in `emissions` |
| `/api/gate` `moved`, `overflow`, `held` | `idle_minutes` and `co2_kg` for each truck |
| `/api/gate` `compare` | `idle_hours_plan` and `idle_co2_kg_plan` for `rung` and `blunt`, then `idle_hours_avoided`, `idle_co2_kg_avoided`, and `idle_label` |

On Tuesday at `+00:00` the plan idles only the 13 HOLD trucks: 13 h and 106 kg CO2, against 129 h and
1,051 kg if the terminal closes. At `+00:10`, with lanes 4 to 6 closed, Rung keeps 89 trucks in their
booked hour, moves 7 to a later hour, and overflows 20. Its plan idles the 129 trucks 40 h, 326 kg
CO2. Closing the terminal idles them 129 h, 1,051 kg. Rung avoids 89 idle hours and 725 kg CO2.

On screen, every idle number is marked as modelled, and the factor and its sources sit one step
back as secondary detail:

- The header counter **Truck idle** shows `idle_hours` and `idle_co2_kg` so far tonight. Hover it for the same numbers if the terminal had closed, the factor, and the sources.
- The box card shows **Truck idle at the gate** under the recommendation: the minutes, the kg CO2, and the first sentence of the label, colored by cause with the words beside it. The info icon holds the full label and the factor.
- The Gate plan headline and its fourth card use `idle_hours_avoided`, `idle_co2_kg_avoided`, and the two `idle_co2_kg_plan` values. A footnote names the factor and links both sources. **Moved to a new slot** and **No slot tonight** add each truck's idle minutes and kg CO2.

Emissions do not change the ladder or the optimizer cost, and `evaluate()` is untouched.

## Regions

The second hackathon twist asked how Rung holds up in another part of the world. The **Region** menu
in the header switches between three profiles in `backend/regions.py`: Pier 7 Los Angeles (the
default), Rotterdam, and Shanghai. A profile swaps the display units (lb or kg), the currency (USD, EUR
at 0.86, or CNY at 7.1, fixed demo rates), the customs authority, the hold owner and hold names, the
source and adapter names (Terminal49, Portbase, or China Single Window), the CO2 factor label, and the
time zone label.

Conversion happens only at the edges. A middleware runs `localize()` on every JSON response from
`/api/`, except `/api/prompts` and the Retell functions, and rewrites generated sentences: "2,400 lb"
becomes "1,089 kg", "440 USD" becomes "378 EUR", and "customs broker" becomes "customs agent".
Identifiers such as steps, rule ids, hold kinds, and box numbers pass through. The browser converts
numeric fields with `frontend/src/region.ts`, and the spoof form converts typed kilograms back to
pounds. `POST /api/region {"region": "rotterdam"}` switches the profile, and `GET /api/state` returns it
under `region`, with the choices under `regions`.

`evaluate()`, the rules, trust, the ladder, and the gate optimizer never see a region.
`tests/test_regions.py` checks that every decision and the gate plan are identical in all three
regions. Only Terminal49 is a live adapter, so outside Los Angeles the data chip says the adapter is
not connected and every field is simulated. [Rung, global](global.md) covers what changes in
Rotterdam, Shanghai or Ningbo, Singapore, and Lagos.

## The ask call

ASK on a weight conflict means: call the trucker. **Call the trucker** on the box card starts it, and
it is built to try on `CMAU9939083`.

1. `POST /api/call/{number}` calls Retell `create_web_call` with the agent id, six dynamic variables as strings (container number, manifest and measured weight, appointment time, trucker name, dray carrier), and the box number in metadata. With `RETELL_FROM_NUMBER` set and `RETELL_PHONE_ENABLED=true` it calls `create_phone_call` to the trucker phone instead.
2. The browser joins the web call with `retell-client-js-sdk`, using the access token, transport, and ICE servers the call returns.
3. The agent, "Pier 7 gate desk", checks it is speaking with the trucker on the appointment, reads both weights, and asks whether the box is loaded as weighed. During the call it can use two custom functions through the tunnel: `lookup_box` for what Rung knows about a box, and `record_outcome` to save the answer. Rung checks the `x-retell-signature` header on both with `retell.verify`.
4. The outcome is one of four values, and it lands on the card as soon as `record_outcome` runs. If the agent never calls it, the post call analysis field of the same name is used.
5. A poller reads the call every 3 seconds. Retell's current web transport does not stream the transcript to the browser, so the transcript lands on the card when the call ends, within 3 seconds.

| Outcome | Effect |
| --- | --- |
| `confirmed_empty` | The trucker backs the manifest. C1 clears and carrier trust gains 0.20 |
| `confirmed_loaded` | The trucker backs the scale. Weighbridge trust gains 0.20 and R12 sends the box to HAND |
| `reschedule_accepted` | The trucker takes a later slot. C1 stays open and R12 votes SLOW |
| `unknown` | C1 stays open and R12 votes HOLD, owner shipping line |

Each call writes a `voice` audit line with the call id when it starts and another with the call id
and outcome when it ends.

With no Retell key, the same button plays a scripted simulated call line by line, and the dashed Demo
picker **The simulated trucker answers** sets the trucker's answer. The inbound job, a trucker calling to ask whether a box is ready,
uses `lookup_box` too, but it needs a phone number bought in Retell.

`make retell-setup` builds the LLM and the agent from code: the prompt for both jobs, the two custom
functions plus `end_call`, and the post call analysis fields `outcome`, `callback_needed`, and `notes`.

**See the agent prompt** on the box card, or **Voice agent prompt** in the Demo controls dock, opens a
drawer with that prompt, the six values filled in for each call, the tools, and the analysis fields.
It reads `GET /api/prompts`, which imports `scripts/retell_setup.py` and returns what the script sends
when a public URL is set, so the drawer and the agent cannot drift apart. No keys or URLs are in the
response.

## Phase 5 features

### Dark feed banner

A red banner in the header reads "Terminal feed dark, N min" while a `source_dark` event is in
force, counted in scenario minutes. It also shows while the Terminal49 poller is failing, because the
key was rejected or the API is unreachable, counted in real minutes. The queue keeps running from the
last snapshot: boxes that depend on the dark feed WATCH, and trucks due at the gate go to HAND.

Fixture mode is not a failure. With no key, or a key that can only create tracking requests, the
data source chip at the right of the latest event line reads "All data simulated" and no banner shows.

### Spoof input

For judges. In **Demo: fake a reading** at the bottom of any box card, type a fake carrier weight, or place or clear a customs, USDA, VACIS,
line, freight, or TMF hold. The engine re-evaluates at once, the trust bars move, and the card shows
the step and trust before and after. Each spoof writes a `spoof` audit line. Try 41,000 lb on
`MSKU5027648`, a 31,470 lb dry box: C1 fires, carrier trust drops from 0.72 to 0.52, and the step goes
from RELEASE to ASK. Or place a customs hold on `CMAU9939083`.

### Rated order mode

The **Rated orders** switch under **More controls** in the Demo controls dock marks the six boxes listed under `rated_orders` in
`scenario.json` with a gate out deadline of 03:00. While it is on, they gain 50 urgency and R13 votes
RELEASE with a pin, through the same ladder, so a safety vote such as ASK on a weight conflict still
wins. On the gate they are solved first and may not take a window that starts after 02:00. Boxes
that lost their slot to them show as Slid at the top of **No slot tonight**, with the slot they would have had.
With lanes 4 to 6 down, five boxes slide.

### Silent reefer classifier

Each reefer reports its circuit (five yard rows share one), its power draw, and any alarm. A unit is
silent when its telemetry stops, or when its last reading is more than 2 h old. Rung classifies why,
and R14 asks the right people:

| Class | Test | ASK text, in short |
| --- | --- | --- |
| Tripped | Three or more units on one circuit went silent within 10 minutes | Check the breaker on that circuit and read every unit on it |
| Failed | An alarm, or a draw outside 2 to 8 kW, before the silence | Send a reefer technician to inspect the unit now |
| Telemetry | A single unit went quiet after a normal draw | The unit is probably still cooling. Get a manual temperature read |

Use **Reefer fault** under **More controls** to Trip circuit, Fail the unit, or Drop telemetry on any
powered reefer.
On Harbor Night the reefer panel also shows a warm up clock: when the product passes its loss limit,
on the model curve. Frozen cargo follows the CSIRO 2007 figure, about 19 h from minus 18 C to minus
10 C with the power off. Chilled and produce use a 6 h time constant, labeled on the card as an
assumption.

### Twist diff

During the hackathon, a message starting with TWIST adds one new rule, event type, or source. Each
twist is recorded in `twists.json` and committed as `twist: <tag>`. The **Twist log** button under **More controls** lists each tag,
when it arrived, what it added, when it merged, and the git diff of its commits, capped at 400 lines.
No twist has been merged yet. Before `+01:00` the panel says so, and from `+01:00` it lists the
scripted `twist-1` placeholder.

## Tests

`make test` runs the pytest suite: the engine cases from the spec (the Harbor Night box, a clear box,
a low urgency C2 box, a dark terminal with a pending release), the API and reset, the gate optimizer
with lanes 4 to 6 closed, the voice paths with a fake Retell client, the Retell setup and tunnel
scripts, the prompt endpoint, fixture mode, every Phase 5 feature, and the idle and CO2 numbers. The
suite blanks real keys, so it never calls an outside service.

`cd frontend && npm test` runs the Vitest suite. It lints every UI string in `frontend/src` for the
spec's copy rules (no contractions, no dashes, no semicolons in on screen text), and checks the ladder
helpers and the prompt drawer parser.
