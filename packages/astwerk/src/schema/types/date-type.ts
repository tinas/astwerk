import type { FieldType, FieldTypeOptions, TokenDefinition } from '../field-type'
import type { TokenOffset } from '../token'

/** An ISO 8601 day (`2026-01-31`) or a UTC instant (`2026-01-31T11:30:00Z`). An item's value may also be a `Date`. */
export type DateValue = string | Date

interface Interval {
  start: number
  end: number
}

interface UtcDay {
  year: number
  month: number
  day: number
}

type DayUnit = 'd' | 'w' | 'm' | 'y'

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/i
const TIME_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i
const DAY_LENGTH = 86_400_000
const MONTHS_IN_YEAR = 12
const LAST_YEAR = 9999
const DAYS_IN_WEEK = 7

const SHIFT_BY_UNIT: Record<DayUnit, (day: UtcDay, amount: number) => number> = {
  d: (day, amount) => Date.UTC(day.year, day.month, day.day + amount),
  w: (day, amount) => Date.UTC(day.year, day.month, day.day + amount * DAYS_IN_WEEK),
  m: (day, amount) => shiftMonths(day, amount),
  y: (day, amount) => shiftMonths(day, amount * MONTHS_IN_YEAR),
}

const todayToken: TokenDefinition<DateValue> = {
  description: 'The current day',
  offsetUnits: Object.keys(SHIFT_BY_UNIT),
  resolve: (offset, context) => formatDay(shiftDay(context.now, offset)),
}

/**
 * A day or an instant in UTC. A day covers all of it, so `created:2026-01-31` is any time that day and
 * `created:>2026-01-31` starts the day after. `@today` is the current day in UTC.
 */
export function date(options: FieldTypeOptions<DateValue> = {}): FieldType<DateValue> {
  return {
    parse: parseDate,
    format: value => (typeof value == 'string' ? value : formatInstant(value.getTime())),
    compare: compareDates,
    suggest: options.suggest,
    tokens: { today: todayToken, ...options.tokens },
  }
}

function parseDate(raw: string): string | undefined {
  if (DAY.test(raw)) return dayStart(raw) == undefined ? undefined : raw
  if (!DATE_TIME.test(raw)) return undefined
  const time = Date.parse(TIME_ZONE.test(raw) ? raw : `${raw}Z`)
  if (!Number.isFinite(time)) return undefined
  const year = new Date(time).getUTCFullYear()
  return year < 0 || year > LAST_YEAR ? undefined : formatInstant(time)
}

function compareDates(a: DateValue, b: DateValue): number {
  const first = toInterval(a)
  const second = toInterval(b)
  if (first == undefined || second == undefined) return Number.NaN
  if (first.end <= second.start) return -1
  if (first.start >= second.end) return 1
  return 0
}

function toInterval(value: DateValue): Interval | undefined {
  const start = typeof value == 'string' ? (dayStart(value) ?? Date.parse(value)) : value.getTime()
  if (!Number.isFinite(start)) return undefined
  return { start, end: start + (typeof value == 'string' && DAY.test(value) ? DAY_LENGTH : 1) }
}

function dayStart(day: string): number | undefined {
  const match = DAY.exec(day)
  if (match == undefined) return undefined
  const [year, month, date] = match.slice(1).map(Number)
  const start = Date.UTC(year, month - 1, date)
  return formatDay(start) == day ? start : undefined
}

function shiftDay(now: Date, offset: TokenOffset | undefined): number {
  const day = { year: now.getUTCFullYear(), month: now.getUTCMonth(), day: now.getUTCDate() }
  const shift = SHIFT_BY_UNIT[(offset?.unit ?? 'd') as DayUnit]
  return shift(day, offset?.amount ?? 0)
}

function shiftMonths(day: UtcDay, amount: number): number {
  const month = day.month + amount
  const lastDay = new Date(Date.UTC(day.year, month + 1, 0)).getUTCDate()
  return Date.UTC(day.year, month, Math.min(day.day, lastDay))
}

function formatDay(time: number): string {
  const value = new Date(time)
  const year = String(value.getUTCFullYear()).padStart(4, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatInstant(time: number): string {
  return Number.isFinite(time) ? new Date(time).toISOString().replace('.000Z', 'Z') : String(time)
}
