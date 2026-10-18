import { afterEach, describe, expect, it } from 'vitest'
import { SOURCE_FIELDS, sayValue } from './format'
import { fromDisplayWeight, holdLabel, sayMoney, sayWeight, setRegion, sourceVia, toDisplayWeight, weightUnit } from './region'

const ROTTERDAM = {
  weight_unit: 'kg' as const,
  currency: 'EUR',
  per_usd: 0.86,
  hold_labels: { customs: 'Customs', USDA: 'NVWA', VACIS: 'Douane scan', TMF: 'Terminal fee' },
  sources: { carrier: 'Portbase, from the shipping line' },
}
const SHANGHAI = { weight_unit: 'kg' as const, currency: 'CNY', per_usd: 7.1 }

afterEach(() => setRegion(undefined))

describe('region display edge', () => {
  it('keeps pounds and US dollars for Los Angeles by default', () => {
    expect(weightUnit()).toBe('lb')
    expect(sayWeight(44100)).toBe('44,100 lb')
    expect(sayMoney(440)).toBe('440 USD')
    expect(holdLabel('TMF')).toBe('TMF')
  })

  it('shows kilograms and euros for Rotterdam', () => {
    setRegion(ROTTERDAM)
    expect(sayWeight(44100)).toBe('20,003 kg')
    expect(sayWeight(2400)).toBe('1,089 kg')
    expect(sayMoney(440)).toBe('378 EUR')
    expect(holdLabel('USDA')).toBe('NVWA')
    expect(sourceVia('carrier')).toBe('Portbase, from the shipping line')
  })

  it('shows yuan for Shanghai', () => {
    expect(sayMoney(440, SHANGHAI)).toBe('3,124 CNY')
    expect(sayWeight(36000, SHANGHAI)).toBe('16,329 kg')
  })

  it('leaves amounts that are not in US dollars alone', () => {
    expect(sayMoney(500, ROTTERDAM, 'EUR')).toBe('500 EUR')
  })

  it('converts a typed weight back to pounds for the API', () => {
    setRegion(ROTTERDAM)
    expect(fromDisplayWeight(20003)).toBe(44099)
    expect(toDisplayWeight(fromDisplayWeight(16329))).toBe(16329)
    setRegion(undefined)
    expect(fromDisplayWeight(36000)).toBe(36000)
  })

  it('formats source fields and conflict values in the region units', () => {
    setRegion(ROTTERDAM)
    const manifest = SOURCE_FIELDS.carrier.find(([key]) => key === 'weight_in_lbs')
    expect(manifest?.[2](36000)).toBe('16,329 kg')
    expect(sayValue('weighbridge', 40500)).toBe('18,370 kg')
    expect(sayValue('demurrage_usd', 275)).toBe('237 EUR')
  })
})
