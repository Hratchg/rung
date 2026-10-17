import type { Step } from './api'

export const GROUP_ORDER: Step[] = ['HAND', 'HOLD', 'SLOW', 'ASK', 'WATCH', 'RELEASE']

export const STEP_META: Record<Step, { meaning: string; chip: string; rail: string }> = {
  HAND: { meaning: 'A person must decide now', chip: 'bg-violet-700 text-white', rail: 'border-violet-700' },
  HOLD: { meaning: 'Gate release withheld for this box until its outside owner clears it', chip: 'bg-red-700 text-white', rail: 'border-red-700' },
  SLOW: { meaning: 'Keep it moving, later or in another lane', chip: 'bg-amber-400 text-amber-950', rail: 'border-amber-400' },
  ASK: { meaning: 'Get fresher information before acting', chip: 'bg-sky-700 text-white', rail: 'border-sky-700' },
  WATCH: { meaning: 'Do nothing yet and recheck at the next poll', chip: 'bg-slate-600 text-white', rail: 'border-slate-500' },
  RELEASE: { meaning: 'Cleared to dispatch at its slot. Planner confirms with one tap', chip: 'bg-emerald-700 text-white', rail: 'border-emerald-600' },
}

export function trustLevel(value: number): { label: string; bar: string; text: string } {
  if (value <= 0) return { label: 'None', bar: 'bg-slate-400', text: 'text-slate-700' }
  if (value < 0.3) return { label: 'Low', bar: 'bg-red-600', text: 'text-red-800' }
  if (value < 0.6) return { label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-900' }
  return { label: 'High', bar: 'bg-emerald-600', text: 'text-emerald-900' }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Terminal local time straight from the ISO string, so the browser time zone never shifts it. */
export function sayDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Not set'
  const [date, rest = ''] = iso.split('T')
  const [, month, day] = date.split('-').map(Number)
  const time = rest.slice(0, 5)
  return time ? `${MONTHS[month - 1]} ${day} ${time}` : `${MONTHS[month - 1]} ${day}`
}

export function sayTime(iso: string | null | undefined): string {
  return iso ? (iso.split('T')[1] ?? '').slice(0, 5) : ''
}

export function sayNum(value: number, digits = 1): string {
  const text = Math.abs(value).toFixed(digits)
  return value < 0 && Number(text) !== 0 ? `minus ${text}` : text
}

export function sayHours(hours: number): string {
  const minutes = Math.max(0, Math.round(hours * 60))
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

const lb = (v: unknown) => `${Math.round(Number(v)).toLocaleString('en-US')} lb`
const celsius = (v: unknown) => `${sayNum(Number(v))} C`
const yesNo = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : 'Unknown')
const words = (v: unknown) => (v == null || v === '' ? 'Not set' : String(v).replace(/_/g, ' '))
type Hold = { name: string; status: string; description?: string }
const holds = (v: unknown) => {
  const list = (v as Hold[] | undefined) ?? []
  if (list.length === 0) return 'None'
  return list.map((h) => `${h.name} ${h.status === 'hold' ? 'active' : h.status}${h.description ? ` (${h.description})` : ''}`).join('. ')
}
type Fee = { type: string; amount: number; currency_code: string }
const fees = (v: unknown) => {
  const list = (v as Fee[] | undefined) ?? []
  if (list.length === 0) return 'None'
  return list.map((f) => `${f.type} ${Math.round(f.amount).toLocaleString('en-US')} ${f.currency_code}`).join('. ')
}

/** Field label and formatter per source, in display order. Fields not listed are not shown. */
export const SOURCE_FIELDS: Record<string, [string, string, (v: unknown) => string][]> = {
  carrier: [
    ['weight_in_lbs', 'Manifest weight', lb],
    ['equipment_type', 'Equipment', words],
    ['equipment_length', 'Length', (v) => (v ? `${v} ft` : 'Not set')],
    ['current_status', 'Status', words],
    ['seal_number', 'Seal', words],
    ['pod_arrived_at', 'Arrived', (v) => sayDateTime(v as string)],
    ['pod_discharged_at', 'Discharged', (v) => sayDateTime(v as string)],
  ],
  terminal: [
    ['available_for_pickup', 'Available', yesNo],
    ['availability_known', 'Availability known', yesNo],
    ['pickup_lfd', 'Last free day', (v) => sayDateTime(v as string)],
    ['fees_at_pod_terminal', 'Fees', fees],
    ['holds', 'Holds', holds],
    ['location_at_pod_terminal', 'Yard spot', words],
    ['pickup_appointment_at', 'Pickup', (v) => sayDateTime(v as string)],
  ],
  customs: [['holds', 'Holds', holds]],
  weighbridge: [
    ['measured_weight_lbs', 'Measured weight', lb],
    ['method', 'Method', words],
  ],
  reefer: [
    ['cargo', 'Cargo', words],
    ['set_point_c', 'Set point', celsius],
    ['product_temp_c', 'Product', celsius],
    ['air_temp_c', 'Air', celsius],
    ['power_on', 'Power', (v) => (v === true ? 'On' : v === false ? 'Off' : 'Unknown')],
  ],
}

export const SOURCE_TITLE: Record<string, string> = {
  carrier: 'Carrier',
  terminal: 'Terminal',
  customs: 'Customs',
  weighbridge: 'Weighbridge',
  reefer: 'Reefer',
}

export function sayValue(key: string, value: unknown): string {
  if (typeof value === 'number') {
    if (key.endsWith('_c')) return celsius(value)
    if (key.includes('weight') || key === 'carrier' || key === 'weighbridge') return lb(value)
    if (key.includes('usd')) return `${Math.round(value).toLocaleString('en-US')} USD`
    if (key.endsWith('_h')) return sayHours(value)
    return sayNum(value)
  }
  if (typeof value === 'boolean') return yesNo(value)
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return sayDateTime(value)
  return words(value)
}

export function laneList(lanes: number[]): string {
  if (lanes.length === 0) return 'none'
  const sorted = [...lanes].sort((a, b) => a - b)
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1)
  if (contiguous && sorted.length > 2) return `${sorted[0]} to ${sorted[sorted.length - 1]}`
  if (sorted.length === 1) return String(sorted[0])
  return `${sorted.slice(0, -1).join(', ')} and ${sorted[sorted.length - 1]}`
}
