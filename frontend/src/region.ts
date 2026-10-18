import type { Region } from './api'

export const LB_TO_KG = 0.45359237

type Units = Pick<Region, 'weight_unit' | 'currency' | 'per_usd'> & { hold_labels?: Record<string, string>; sources?: Record<string, string> }

const LOS_ANGELES: Units = { weight_unit: 'lb', currency: 'USD', per_usd: 1 }

let current: Units = LOS_ANGELES

/** The display edge of the region switch. The API keeps pounds and US dollars, so numbers convert here only. */
export function setRegion(region: Units | undefined): void {
  current = region ?? LOS_ANGELES
}

export function weightUnit(r: Units = current): 'lb' | 'kg' {
  return r.weight_unit
}

export function toDisplayWeight(lb: number, r: Units = current): number {
  return r.weight_unit === 'kg' ? Math.round(lb * LB_TO_KG) : Math.round(lb)
}

export function fromDisplayWeight(value: number, r: Units = current): number {
  return r.weight_unit === 'kg' ? Math.round(value / LB_TO_KG) : Math.round(value)
}

export function sayWeight(lb: number, r: Units = current): string {
  return `${toDisplayWeight(lb, r).toLocaleString('en-US')} ${r.weight_unit}`
}

export function sayMoney(amount: number, r: Units = current, code = 'USD'): string {
  if (code !== 'USD') return `${Math.round(amount).toLocaleString('en-US')} ${code}`
  return `${Math.round(amount * r.per_usd).toLocaleString('en-US')} ${r.currency}`
}

export function holdLabel(name: string, r: Units = current): string {
  return r.hold_labels?.[name] ?? name
}

export function sourceVia(source: string, r: Units = current): string {
  return r.sources?.[source] ?? ''
}
