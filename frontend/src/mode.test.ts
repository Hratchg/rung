import { describe, expect, it } from 'vitest'
import type { NightState } from './mode'
import { crisisCauses, incidents, joinAnd, nightMode } from './mode'

const calm: NightState = {
  lanes: 6,
  lanes_open: [1, 2, 3, 4, 5, 6],
  dark_feed: [],
  event_log: [],
  reefers: [{ number: 'TGHU1111111', circuit: 'R1', power_on: true, silent: false }],
  rated: { available: true, on: false, deadline: null, latest_window: null, boxes: [] },
}

const harbor: NightState = {
  ...calm,
  lanes_open: [1, 2, 3],
  dark_feed: [{ source: 'terminal', cause: 'scenario', since: '2026-10-18T22:40:00-07:00', minutes: 4, text: 'Terminal feed dark, 4 min', detail: '' }],
  event_log: [
    { type: 'reefer_power_off', box: 'MSKU1234567', ignored: 'power already in that state' },
    { type: 'hold_placed', box: 'TCLU7654321', hold: { name: 'customs' } },
    { type: 'lanes_down', lanes: [4, 5, 6] },
  ],
  reefers: [
    { number: 'MSKU1234567', circuit: 'R3', power_on: false, silent: false },
    { number: 'TGHU2222222', circuit: 'R3', power_on: true, silent: true },
  ],
}

describe('night mode', () => {
  it('calls Harbor Night crisis and everything else everyday', () => {
    expect(nightMode('harbor_night')).toBe('crisis')
    expect(nightMode('tuesday')).toBe('everyday')
  })

  it('finds nothing wrong on a calm night', () => {
    expect(incidents(calm)).toEqual([])
  })

  it('lists each incident in reading order with its impact', () => {
    const list = incidents(harbor, { moved: 46, overflow: 28, feedBoxes: 191, feedHand: 44 })
    expect(list.map((i) => i.kind)).toEqual(['lanes', 'feed', 'hold', 'reefer', 'silent'])
    expect(list[0].title).toBe('Lanes 4 to 6 closed')
    expect(list[0].detail).toBe('46 trucks moved, 28 with no slot tonight.')
    expect(list[1].detail).toBe('191 boxes wait on it. 44 trucks due now come to you.')
    expect(list[1].action?.filter).toBe('HAND')
    expect(list[2].title).toBe('Customs hold on TCLU7654321')
    expect(list[2].detail).toContain('customs broker')
    expect(list[3].title).toBe('Reefer MSKU1234567 has no power')
    expect(list[4].action?.filter).toBe('ASK')
  })

  it('drops a hold once it is cleared', () => {
    const cleared = { ...harbor, event_log: [{ type: 'hold_cleared', box: 'TCLU7654321' }, ...harbor.event_log] }
    expect(incidents(cleared).some((i) => i.kind === 'hold')).toBe(false)
  })

  it('names rated orders with their deadline', () => {
    const rated = { ...calm, rated: { available: true, on: true, deadline: '2026-10-19T03:00:00-07:00', latest_window: '02:00', boxes: ['A', 'B'] } }
    expect(incidents(rated)[0].detail).toBe('2 boxes must be out by 03:00. They get first claim on the gate.')
  })

  it('explains why a box looks different tonight', () => {
    expect(joinAnd(crisisCauses(['R9', 'R10', 'R7']))).toBe('its lane is closed and a feed it needs is dark')
    expect(crisisCauses(['R5', 'R6'])).toEqual(['its reefer is in trouble under a hold'])
    expect(crisisCauses(['R0'])).toEqual([])
  })
})
