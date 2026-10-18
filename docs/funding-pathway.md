# Rung funding pathway

**Pitch line.** Rung launches on a National Science Foundation SBIR Phase I grant, up to $305K from
America's Seed Fund, to prove gate triage on live San Pedro Bay terminal data. Its Harbor Night
resilience is the dual use case for USTRANSCOM and SDDC at strategic seaports such as Long Beach, and
port-led MARAD grants pay for the rollout.

**Poster panel.** Funding pathway. Launch: NSF SBIR Phase I, America's Seed Fund (NSF 26-510), up to
$305K over 6 to 18 months, to prove Rung on live San Pedro Bay terminal data. Harden: DoD SBIR with
USTRANSCOM and SDDC for strategic seaports such as Long Beach. Scale: port-led MARAD PIDP grants. One
tool for ordinary Tuesdays and Harbor Nights.

This answers hackathon Twist 1: name at least one US federal funding pathway as the primary or
alternative source to launch the venture. Every program below was checked on Oct 17, 2026, against
agency pages and Congressional Research Service reports. Partner names are targets. Rung has no
letters of support yet.

| Role | Pathway | Money and timing | Partner |
| --- | --- | --- | --- |
| Primary: launch | NSF SBIR/STTR Phase I, solicitation NSF 26-510 [1] | Up to $305K for 6 to 18 months. Project Pitch first, then full proposal on Nov 4, 2026 or Mar 4, 2027 | A Port of Long Beach marine terminal, shadow mode pilot |
| Alternative 1: harden | DoD SBIR monthly releases, sponsored by USTRANSCOM and SDDC [5][6] | Phase I about $315K for 6 to 12 months. A new release every month | SDDC 596th Transportation Brigade, Port of Long Beach |
| Alternative 2: scale | MARAD Port Infrastructure Development Program (PIDP) [11][12] | Up to 80 percent federal share. FY2026 offered $488.6M and closed June 1, 2026 | Port of Long Beach as lead applicant, Rung as private partner |

## Primary: NSF SBIR Phase I (America's Seed Fund)

**Solicitation.** NSF 26-510, "Developing Deep Technologies that Advance U.S. Competitiveness and
Security", relaunched after Congress reauthorized SBIR [1]. It funds "across nearly all technology
areas", so Rung needs no topic match. A Project Pitch comes first. An invitation is valid for the next
two deadlines, and each company may send two pitches a year [1][2].

**Award and timeline.** Up to $305,000 for 6 to 18 months, including the optional I-Corps training.
Phase II is up to $1.25M, and each company can receive up to $2M in total [1]. Full proposal deadlines
are Nov 4, 2026, Mar 4, 2027, and Jul 7, 2027 [1]. We pitch now and aim for March 4, or November 4 if
the invitation comes back in time.

**What Phase I proves.** The R&D risk is deciding under bad data, not drawing a dashboard. On a month
of replayed and then live gate data from one terminal, in shadow mode next to the planner:

- **Trust calibration.** When two sources disagree on a box, the source Rung trusts more turns out to be right, measured against what the gate finally did.
- **Safe degraded mode.** With a feed dark, Rung releases no box that should have waited, and the planner gets only the boxes due at the gate. The simulation gives 21 boxes instead of more than 100.
- **Re-slotting at terminal scale.** A full day of appointments re-solves in under 100 ms. The simulation does 129 trucks in under 1 ms.
- **Measured idle CO2.** Compare Rung's modelled idle hours with real gate transaction times, so "modelled" becomes "measured".

**Partner.** A marine terminal at the Port of Long Beach, for read-only data and a shadow mode pilot.
Long Beach is one of 18 commercial strategic seaports [10], which links straight to Alternative 1.

**Why dual use helps.** NSF asks for commercial impact first, and the everyday Tuesday customer is
the terminal paying to cut fees, delays, and truck idle. The solicitation title also puts security in
scope, and Harbor Night is exactly that case.

## Alternative 1: DoD, with USTRANSCOM and SDDC

**Vehicle.** DoD now issues SBIR and STTR calls every month, as Releases 1 to 12. FY27 Release 1
pre-released Oct 7, opens Oct 28, and closes Nov 25, 2026 [5]. We found no port or logistics topic
in it [6][20], and DIU has no open logistics call [8]. So the move is to brief USTRANSCOM and SDDC's
Transportation Engineering Agency, which has a Futures and Science and Technology office [9], and ask
them to sponsor a topic in a later FY27 release. USTRANSCOM has sponsored SBIR work before, such as
an autonomous pallet loader [21].

**Award and timeline.** The Navy funds Phase I at up to $200K for 6 months plus a $115K option, and
AFWERX lists up to $323K for 6 months [6][7]. The 2026 law adds Phase II "strategic breakthrough"
awards of up to $30M [3].

**What Phase I proves.** Harbor Night run as a port readiness exercise: lanes down, a feed dark,
military and commercial boxes mixed, and Rung running with no network at all, as it already can.
Success means the gate keeps moving, every hold has a named owner, and a person signs every hard
call.

**Partner.** SDDC's 596th Transportation Brigade runs port operations at Military Ocean Terminal
Concord and at the West Coast strategic seaports [9]. Long Beach has a Port Readiness Committee in
which USTRANSCOM, SDDC, MARAD, and the Coast Guard all sit [10].

**Why dual use helps.** DoD wants a commercial market behind every SBIR, and Rung's market is
commercial terminals. Strategic seaports are commercial ports that must also support a military
deployment, so the same tool serves both.

## Alternative 2: MARAD PIDP, led by the port

**Vehicle.** PIDP funds projects that improve the safety, efficiency, or reliability of moving goods
through ports. Eligible projects include "operational improvements, including projects to improve
port resilience" and "anti-idling technologies". The FY2026 notice added a priority for projects
that use innovative technology [12]. A port or public agency must lead, jointly with private
partners, and the federal share is capped at 80 percent [12]. Rung never touches the banned Chinese
LOGINK platform [12].

**Award and timeline.** The FY2026 round offered $488.6M and closed June 1, 2026 [11]. FY2027 money is
uncertain. The infrastructure law's yearly PIDP money ended with FY2026 [11], a stopgap bill funds
government only through Dec 11, 2026, and the House's FY2027 bill would fund PIDP by moving unused
passenger rail money [13][14].

**Scope and partner.** Rolling Rung out across every gate lane at the Port of Long Beach, with the port
applying as lead. This is the rollout stage, not the launch.

**Why dual use helps.** PIDP scores port resilience, defined as sustaining critical operations
through disruptions [12]. It also helps that Long Beach is a strategic seaport.

## Checked and not chosen

| Program | Why not now |
| --- | --- |
| DHS S&T SBIR | The last solicitation we found is 25.1, from January 2025. Phase I is up to $175K for 5 months when one opens [15] |
| DHS S&T Long Range BAA | Open until 2029, but its maritime and port security topics are gone, and none of its 9 open topics fits [16] |
| EPA Clean Ports | The $3B was awarded in 2024, EPA now runs 51 grants, and we found no new round. It funds zero emission equipment and planning, not software. The Port of Los Angeles's $411.7M grant is still listed [17] |
| DOT SBIR | The FY26 call closed July 7, 2026. The nearest topic was 26-OS2, Freight Corridor Predictive Intelligence. Watch for the FY27 call [18] |
| DOE SBIR | The FY26 Phase I call covered only four Genesis Mission topics, such as biotech and quantum. A broader call is expected this fall [19] |

## What changed recently

- SBIR and STTR lapsed from Oct 1, 2025 until P.L. 119-83 was signed on Apr 13, 2026. It runs through Sep 30, 2031, adds research security checks, and creates strategic breakthrough awards [3][4].
- NSF relaunched as NSF 26-510, with a deep technology and security focus [1].
- DoD, now styled the Department of War, moved to monthly SBIR releases for FY27 [5].
- PIDP lost its yearly infrastructure law money after FY2026 [13][14].
- DHS has posted no new SBIR call, and its BAA dropped the maritime topics [15][16].

## Sources

1. NSF 26-510 solicitation. https://www.nsf.gov/funding/opportunities/small-business-innovation-research-small-business-technology/nsf26-510/solicitation
2. NSF SBIR Project Pitch. https://seedfund.nsf.gov/project-pitch/
3. Public Law 119-83, Small Business Innovation and Economic Security Act. https://www.congress.gov/119/plaws/publ83/PLAW-119publ83.htm
4. CRS Insight IN12705, "Small Business Research Programs Reauthorized After Six-Month Lapse". https://www.congress.gov/crs-product/IN12705
5. Navy SBIR/STTR, DoW FY27 release calendar. https://www.navysbir.com/
6. Navy FY27 Release 1 topics and Phase I limits. https://navysbir.us/topics27_1.htm
7. AFWERX, Get Funded. https://afwerx.com/get-funded/
8. DIU open solicitations. https://www.diu.mil/work-with-us/open-solicitations
9. SDDC Capabilities Book. https://www.sddc.army.mil/Shared%20Documents/SDDC%20Capabilities%20Book.pdf
10. MARAD, National Port Readiness Network. https://www.maritime.dot.gov/ports/national-port-readiness-network-nprn
11. MARAD, Port Infrastructure Development Program. https://www.maritime.dot.gov/PIDPgrants
12. MARAD, FY2026 PIDP Notice of Funding Opportunity, MA-PID-26-001. https://www.maritime.dot.gov/ports/port-infrastructure-development-program/pidp-fy-2026-nofo
13. CRS R48644, Surface Transportation Reauthorization. https://www.congress.gov/crs-product/R48644
14. CRS R49341, THUD Appropriations for FY2027. https://www.everycrsreport.com/reports/R49341.html
15. DHS S&T SBIR, and the 25.1 solicitation notice. https://www.dhs.gov/science-and-technology/sbir and https://www.dhs.gov/science-and-technology/news/2025/01/06/dhs-opens-solicitation-small-businesses-apply-funding-innovative-research-and-development-projects
16. DHS S&T, Current LRBAA Topics. https://www.dhs.gov/science-and-technology/current-lrbaa-topics
17. EPA Clean Ports Program and awards. https://www.epa.gov/ports-initiative/cleanports and https://www.epa.gov/ports-initiative/clean-ports-program-awards
18. DOT SBIR FY26 solicitation, Volpe Center. https://www.volpe.dot.gov/work-us/small-business-innovation-research/fy26-solicitation-now-open
19. DOE SBIR/STTR. https://www.energy.gov/technologycommercialization/doe-small-business-innovation-research-sbir-and-small-business
20. Defense SBIR/STTR Innovation Portal, topic search. https://www.dodsbirsttr.mil/topics-app/
21. Military Aerospace, "Stratom wins SBIR Phase III contract for autonomous cargo handling" (trade press). https://www.militaryaerospace.com/uncrewed/article/55401616/stratom-wins-sbir-phase-iii-contract-for-autonomous-cargo-handling
