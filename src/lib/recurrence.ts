import {
  advanceByFrequency,
  fromISODate,
  isSameOrAfter,
  isSameOrBefore,
  startOfDay,
  toISODate,
} from './date-utils'
import type { RecurringTransactionRow } from '@/types/database'

export interface RecurringOccurrence {
  date: string
  amount: number
  templateId: string
}

/**
 * Expande virtualmente las ocurrencias de una recurrente entre dos fechas
 * (sin escribir en DB). Útil para mostrar próximos pagos y proyección.
 */
export function expandRecurring(
  template: RecurringTransactionRow,
  from: Date,
  to: Date,
  maxIterations = 365,
): RecurringOccurrence[] {
  if (!template.active) return []
  const out: RecurringOccurrence[] = []
  const fromDay = startOfDay(from)
  const toDay = startOfDay(to)

  let cursor = fromISODate(template.next_occurrence_date)
  const endLimit = template.end_date ? fromISODate(template.end_date) : null

  let iterations = 0
  while (iterations < maxIterations) {
    iterations += 1
    if (endLimit && cursor > endLimit) break
    if (cursor > toDay) break

    if (isSameOrAfter(cursor, fromDay) && isSameOrBefore(cursor, toDay)) {
      out.push({
        date: toISODate(cursor),
        amount: Number(template.amount),
        templateId: template.id,
      })
    }

    cursor = advanceByFrequency(cursor, template.frequency, template.interval_count)
  }
  return out
}

/**
 * Calcula el próximo `next_occurrence_date` después de marcar una ocurrencia como ejecutada.
 */
export function advanceNextOccurrence(
  template: Pick<RecurringTransactionRow, 'frequency' | 'interval_count' | 'next_occurrence_date'>,
): string {
  const next = advanceByFrequency(
    fromISODate(template.next_occurrence_date),
    template.frequency,
    template.interval_count,
  )
  return toISODate(next)
}
