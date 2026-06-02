import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format as formatFn,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { RecurrenceFrequency } from '@/types/database'

export function today(): Date {
  return startOfDay(new Date())
}

export function toISODate(d: Date): string {
  return formatFn(d, 'yyyy-MM-dd')
}

export function fromISODate(s: string): Date {
  return parseISO(s)
}

export function formatDateShort(input: Date | string): string {
  const d = typeof input === 'string' ? parseISO(input) : input
  return formatFn(d, "d 'de' MMM", { locale: es })
}

export function formatDateLong(input: Date | string): string {
  const d = typeof input === 'string' ? parseISO(input) : input
  return formatFn(d, "EEEE d 'de' MMMM yyyy", { locale: es })
}

export function formatMonthYear(input: Date | string): string {
  const d = typeof input === 'string' ? parseISO(input) : input
  return formatFn(d, "MMM yyyy", { locale: es })
}

export function daysFromToday(input: Date | string): number {
  const d = typeof input === 'string' ? parseISO(input) : input
  return differenceInCalendarDays(d, today())
}

export function isSameOrBefore(a: Date, b: Date): boolean {
  return isBefore(a, b) || isEqual(a, b)
}

export function isSameOrAfter(a: Date, b: Date): boolean {
  return isAfter(a, b) || isEqual(a, b)
}

export function advanceByFrequency(
  from: Date,
  frequency: RecurrenceFrequency,
  interval = 1,
): Date {
  switch (frequency) {
    case 'daily':
      return addDays(from, interval)
    case 'weekly':
      return addWeeks(from, interval)
    case 'biweekly':
      return addDays(from, 14 * interval)
    case 'monthly':
      return addMonths(from, interval)
    case 'yearly':
      return addYears(from, interval)
    default:
      return addMonths(from, interval)
  }
}

// Para un día N del mes (1-31), devuelve la próxima fecha calendar a partir de `from`
// (clamp al último día del mes si el mes no tiene ese día).
export function nextMonthlyOccurrenceOnDay(from: Date, dayOfMonth: number): Date {
  const base = new Date(from.getFullYear(), from.getMonth(), 1)
  const candidate = clampToMonth(base, dayOfMonth)
  if (isSameOrAfter(candidate, startOfDay(from))) {
    return candidate
  }
  const nextMonth = addMonths(base, 1)
  return clampToMonth(nextMonth, dayOfMonth)
}

export function clampToMonth(monthStart: Date, dayOfMonth: number): Date {
  const lastDay = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  ).getDate()
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    Math.min(dayOfMonth, lastDay),
  )
}

export { addDays, addMonths, addWeeks, parseISO, startOfDay }
