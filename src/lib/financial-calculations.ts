import {
  addDays,
  advanceByFrequency,
  daysFromToday,
  fromISODate,
  nextMonthlyOccurrenceOnDay,
  startOfDay,
  toISODate,
  today,
} from './date-utils'
import type {
  AccountRow,
  CreditCardRow,
  DebtInstallmentRow,
  DebtRow,
  IncomeSourceRow,
  RecurringTransactionRow,
  SalaryPeriodRow,
} from '@/types/database'
import type {
  CardWithDerived,
  ProjectedEvent,
  ProjectionInput,
  PurchaseRecommendation,
  UpcomingIncome,
  UpcomingPayment,
  UpcomingPaymentStatus,
} from '@/types/domain'
import { expandRecurring } from './recurrence'

// =====================================================================
// Reglas laborales Colombia (estimaciones; el usuario puede ajustar manualmente)
// =====================================================================

/** Sueldo quincenal estándar: la mitad del mensual. */
export function calculateBiweeklySalary(monthlyAmount: number): number {
  if (monthlyAmount <= 0) return 0
  return round(monthlyAmount / 2)
}

/**
 * Prima legal (Colombia): semestre completo equivale a un sueldo.
 * Fórmula: (salarioMensual × diasTrabajados) / 360
 */
export function calculateEstimatedPrima(
  monthlySalary: number,
  daysWorkedInSemester: number,
): number {
  if (monthlySalary <= 0 || daysWorkedInSemester <= 0) return 0
  return round((monthlySalary * daysWorkedInSemester) / 360)
}

/**
 * Intereses sobre cesantías (Colombia, 12% anual sobre saldo acumulado).
 * Fórmula: (cesantiasAcumuladas × 0.12 × diasTrabajados) / 360
 */
export function calculateCesantiasInterest(
  cesantiasAccumulated: number,
  daysWorked: number,
): number {
  if (cesantiasAccumulated <= 0 || daysWorked <= 0) return 0
  return round((cesantiasAccumulated * 0.12 * daysWorked) / 360)
}

// =====================================================================
// Agregados de saldo / deuda
// =====================================================================

export function calculateAvailableCardLimit(card: {
  credit_limit: number
  current_debt: number
}): number {
  return round(Math.max(0, (card.credit_limit ?? 0) - (card.current_debt ?? 0)))
}

export function calculateTotalDebt(
  debts: Pick<DebtRow, 'remaining_balance' | 'archived'>[],
  cards: Pick<CreditCardRow, 'current_debt' | 'archived'>[],
): number {
  const debtsTotal = debts
    .filter((d) => !d.archived)
    .reduce((acc, d) => acc + Number(d.remaining_balance ?? 0), 0)
  const cardsTotal = cards
    .filter((c) => !c.archived)
    .reduce((acc, c) => acc + Number(c.current_debt ?? 0), 0)
  return round(debtsTotal + cardsTotal)
}

export function calculateTotalAvailableMoney(
  accounts: Pick<AccountRow, 'balance' | 'archived'>[],
): number {
  return round(
    accounts
      .filter((a) => !a.archived)
      .reduce((acc, a) => acc + Number(a.balance ?? 0), 0),
  )
}

/** Solo la deuda de tarjetas de crédito (prompt 2.md). */
export function calculateTotalCreditCardDebt(
  cards: Pick<CreditCardRow, 'current_debt' | 'archived'>[],
): number {
  return round(
    cards
      .filter((c) => !c.archived)
      .reduce((acc, c) => acc + Number(c.current_debt ?? 0), 0),
  )
}

/** Deuda en obligaciones distintas a tarjetas (préstamos, deudas generales). */
export function calculateOtherDebt(
  debts: Pick<DebtRow, 'remaining_balance' | 'archived'>[],
): number {
  return round(
    debts
      .filter((d) => !d.archived)
      .reduce((acc, d) => acc + Number(d.remaining_balance ?? 0), 0),
  )
}

export function calculateLiquidNetWorth(
  accounts: Pick<AccountRow, 'balance' | 'archived'>[],
  cards: Pick<CreditCardRow, 'current_debt' | 'archived'>[],
  debts: Pick<DebtRow, 'remaining_balance' | 'archived'>[],
): number {
  return round(
    calculateTotalAvailableMoney(accounts) - calculateTotalDebt(debts, cards),
  )
}

/** Alias con el nombre exacto del prompt 2.md (patrimonio líquido estimado). */
export const calculateNetWorth = calculateLiquidNetWorth

export function calculateTotalCreditAvailable(
  cards: Pick<CreditCardRow, 'credit_limit' | 'current_debt' | 'archived'>[],
): number {
  return round(
    cards
      .filter((c) => !c.archived)
      .reduce(
        (acc, c) =>
          acc + calculateAvailableCardLimit({
            credit_limit: c.credit_limit,
            current_debt: c.current_debt,
          }),
        0,
      ),
  )
}

// =====================================================================
// Tarjetas: próximas fechas de corte y pago
// =====================================================================

export function nextStatementDate(
  card: Pick<CreditCardRow, 'statement_day'>,
  fromDate: Date = today(),
): Date {
  return nextMonthlyOccurrenceOnDay(fromDate, card.statement_day)
}

export function nextPaymentDueDate(
  card: Pick<CreditCardRow, 'payment_due_day'>,
  fromDate: Date = today(),
): Date {
  return nextMonthlyOccurrenceOnDay(fromDate, card.payment_due_day)
}

export function decorateCard(card: CreditCardRow): CardWithDerived {
  const availableLimit = calculateAvailableCardLimit(card)
  const utilization =
    card.credit_limit > 0 ? card.current_debt / card.credit_limit : 0
  return {
    ...card,
    availableLimit,
    utilization,
    nextStatementDate: nextStatementDate(card),
    nextPaymentDueDate: nextPaymentDueDate(card),
  }
}

// =====================================================================
// Deudas: generación de cuotas
// =====================================================================

export function generateDebtInstallments(
  debt: Pick<
    DebtRow,
    | 'id'
    | 'user_id'
    | 'remaining_installments'
    | 'approx_installment_amount'
    | 'next_payment_date'
    | 'payment_frequency'
  >,
  options: { maxCount?: number } = {},
): Omit<DebtInstallmentRow, 'id' | 'created_at' | 'updated_at'>[] {
  const count = options.maxCount ?? debt.remaining_installments ?? 0
  if (count <= 0 || !debt.next_payment_date) return []
  const start = fromISODate(debt.next_payment_date)
  const recurrenceFreq =
    debt.payment_frequency === 'custom' ? 'monthly' : debt.payment_frequency
  const out: Omit<DebtInstallmentRow, 'id' | 'created_at' | 'updated_at'>[] = []
  for (let i = 0; i < count; i += 1) {
    const due =
      i === 0 ? start : advanceByFrequency(start, recurrenceFreq, i)
    out.push({
      user_id: debt.user_id,
      debt_id: debt.id,
      sequence: i + 1,
      due_date: toISODate(due),
      amount: round(debt.approx_installment_amount),
      status: 'pending',
      paid_transaction_id: null,
    })
  }
  return out
}

// =====================================================================
// Proyección financiera
// =====================================================================

export function projectFutureBalance(input: ProjectionInput): ProjectedEvent[] {
  const start = startOfDay(input.asOfDate)
  const end = addDays(start, input.horizonDays)

  type DeltaEvent = {
    date: string
    description: string
    signedAmount: number
    source: string
    sourceId?: string
    kind: ProjectedEvent['kind']
  }

  const events: DeltaEvent[] = []

  // Recurrentes: expand virtual
  for (const r of input.recurring) {
    if (!r.active) continue
    const occurrences = expandRecurring(r, start, end)
    for (const occ of occurrences) {
      const sign = r.kind === 'income' ? 1 : -1
      events.push({
        date: occ.date,
        description: r.name,
        signedAmount: sign * Number(r.amount),
        source: 'recurring',
        sourceId: r.id,
        kind: r.kind,
      })
    }
  }

  // Cuotas de deuda pendientes
  for (const inst of input.installments) {
    if (inst.status !== 'pending') continue
    const d = fromISODate(inst.due_date)
    if (d < start || d > end) continue
    events.push({
      date: inst.due_date,
      description: 'Cuota de deuda',
      signedAmount: -Number(inst.amount),
      source: 'debt_installment',
      sourceId: inst.id,
      kind: 'debt_payment',
    })
  }

  // Salarios futuros (períodos)
  for (const sp of input.salaryPeriods) {
    const d = fromISODate(sp.period_end)
    if (d < start || d > end) continue
    if (sp.actual_amount !== null && sp.actual_amount !== undefined) continue
    events.push({
      date: sp.period_end,
      description:
        sp.type === 'prima'
          ? 'Prima estimada'
          : sp.type === 'cesantias_interest'
            ? 'Intereses cesantías'
            : sp.type === 'bonus'
              ? 'Bono'
              : 'Salario',
      signedAmount: Number(sp.expected_amount),
      source: 'salary_period',
      sourceId: sp.id,
      kind: 'salary',
    })
  }

  // Eventos puntuales adicionales (p.ej. una compra simulada)
  for (const o of input.scheduledOneOffs ?? []) {
    const d = fromISODate(o.date)
    if (d < start || d > end) continue
    const sign = o.kind === 'income' ? 1 : -1
    events.push({
      date: o.date,
      description: o.description,
      signedAmount: sign * o.amount,
      source: 'one_off',
      sourceId: o.sourceId,
      kind: o.kind,
    })
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  let running = input.startBalance
  return events.map((e) => {
    running = round(running + e.signedAmount)
    return {
      date: e.date,
      kind: e.kind,
      amount: Math.abs(e.signedAmount),
      signedAmount: e.signedAmount,
      source: e.source,
      sourceId: e.sourceId,
      description: e.description,
      runningBalance: running,
    }
  })
}

export function projectedBalanceAt(
  events: ProjectedEvent[],
  startBalance: number,
  daysFromNow: number,
): number {
  const cutoffISO = toISODate(addDays(today(), daysFromNow))
  let bal = startBalance
  for (const e of events) {
    if (e.date <= cutoffISO) bal = e.runningBalance
    else break
  }
  return bal
}

/** Alias con el nombre exacto del prompt 2.md (saldo proyectado a N días). */
export const calculateProjectedBalance = projectedBalanceAt

// =====================================================================
// Próximos pagos / ingresos (prompt 2.md)
// =====================================================================

function paymentStatus(daysUntil: number, soonWindow: number): UpcomingPaymentStatus {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil <= soonWindow) return 'soon'
  return 'scheduled'
}

/**
 * Próximos pagos en una ventana (cuotas de deuda, pagos de tarjeta y
 * gastos recurrentes), ordenados por fecha y anotados con estado.
 */
export function calculateUpcomingPayments(
  input: {
    installments: Pick<DebtInstallmentRow, 'debt_id' | 'due_date' | 'amount' | 'status'>[]
    debts: Pick<DebtRow, 'id' | 'name'>[]
    cards: Pick<CreditCardRow, 'name' | 'current_debt' | 'payment_due_day' | 'archived'>[]
    recurring: RecurringTransactionRow[]
  },
  options: { horizonDays?: number; soonWindow?: number; limit?: number; asOfDate?: Date } = {},
): UpcomingPayment[] {
  const horizonDays = options.horizonDays ?? 30
  const soonWindow = options.soonWindow ?? 3
  const start = startOfDay(options.asOfDate ?? today())
  const horizon = addDays(start, horizonDays)
  const out: UpcomingPayment[] = []

  for (const inst of input.installments) {
    if (inst.status !== 'pending') continue
    const d = fromISODate(inst.due_date)
    if (d > horizon) continue
    const debt = input.debts.find((x) => x.id === inst.debt_id)
    out.push({
      date: inst.due_date,
      label: `Cuota: ${debt?.name ?? 'Deuda'}`,
      amount: Number(inst.amount),
      type: 'installment',
      daysUntil: daysFromToday(inst.due_date),
      status: 'scheduled',
    })
  }

  for (const c of input.cards) {
    if (c.archived || Number(c.current_debt) <= 0) continue
    const due = new Date(
      start.getFullYear(),
      start.getMonth() + (c.payment_due_day < start.getDate() ? 1 : 0),
      Math.min(c.payment_due_day, 28),
    )
    const iso = toISODate(due)
    out.push({
      date: iso,
      label: `Pago tarjeta ${c.name}`,
      amount: Number(c.current_debt),
      type: 'card',
      daysUntil: daysFromToday(iso),
      status: 'scheduled',
    })
  }

  for (const r of input.recurring) {
    if (!r.active || r.kind === 'income') continue
    for (const occ of expandRecurring(r, start, horizon)) {
      out.push({
        date: occ.date,
        label: `Recurrente: ${r.name}`,
        amount: occ.amount,
        type: 'recurring',
        daysUntil: daysFromToday(occ.date),
        status: 'scheduled',
        sourceId: r.id,
      })
    }
  }

  for (const p of out) p.status = paymentStatus(p.daysUntil, soonWindow)
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return typeof options.limit === 'number' ? out.slice(0, options.limit) : out
}

/**
 * Próximos ingresos: salarios/períodos esperados y recurrentes de tipo income.
 */
export function calculateUpcomingIncome(
  input: {
    salaryPeriods: Pick<SalaryPeriodRow, 'period_end' | 'expected_amount' | 'actual_amount' | 'type'>[]
    recurring: RecurringTransactionRow[]
  },
  options: { horizonDays?: number; limit?: number; asOfDate?: Date } = {},
): UpcomingIncome[] {
  const horizonDays = options.horizonDays ?? 30
  const start = startOfDay(options.asOfDate ?? today())
  const horizon = addDays(start, horizonDays)
  const out: UpcomingIncome[] = []

  for (const sp of input.salaryPeriods) {
    const d = fromISODate(sp.period_end)
    if (d < start || d > horizon) continue
    if (sp.actual_amount !== null && sp.actual_amount !== undefined) continue
    const label =
      sp.type === 'prima'
        ? 'Prima estimada'
        : sp.type === 'cesantias_interest'
          ? 'Intereses cesantías'
          : sp.type === 'bonus'
            ? 'Bono'
            : 'Salario'
    out.push({
      date: sp.period_end,
      label,
      amount: Number(sp.expected_amount),
      daysUntil: daysFromToday(sp.period_end),
    })
  }

  for (const r of input.recurring) {
    if (!r.active || r.kind !== 'income') continue
    for (const occ of expandRecurring(r, start, horizon)) {
      out.push({
        date: occ.date,
        label: r.name,
        amount: occ.amount,
        daysUntil: daysFromToday(occ.date),
      })
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return typeof options.limit === 'number' ? out.slice(0, options.limit) : out
}

/**
 * Capacidad de gasto segura (prompt 2.md): cuánto puede gastar el usuario sin
 * comprometer sus pagos próximos ni un colchón mínimo.
 *
 * = dinero disponible − pagos comprometidos en la ventana − colchón de seguridad
 * (nunca negativo).
 */
export function calculateSafeSpendingCapacity(
  input: {
    available: number
    upcomingPayments: Pick<UpcomingPayment, 'amount'>[]
    safetyBuffer?: number
  },
): number {
  const committed = input.upcomingPayments.reduce(
    (acc, p) => acc + Number(p.amount ?? 0),
    0,
  )
  const buffer = input.safetyBuffer ?? 0
  return round(Math.max(0, input.available - committed - buffer))
}

// =====================================================================
// Recomendación de tarjeta para compra
// =====================================================================

/**
 * Score: prioriza float largo (días entre compra y próximo corte), luego
 * cupo suficiente, luego menor utilización actual.
 */
export function recommendCardForPurchase(
  amount: number,
  purchaseDate: Date,
  cards: CreditCardRow[],
): PurchaseRecommendation {
  const usableCards = cards.filter((c) => !c.archived)
  if (usableCards.length === 0) {
    return {
      cardId: null,
      daysOfFloat: 0,
      reason: 'No tienes tarjetas registradas.',
    }
  }

  const candidates = usableCards
    .map((card) => {
      const available = calculateAvailableCardLimit(card)
      const utilizationAfter =
        card.credit_limit > 0
          ? (Number(card.current_debt) + amount) / card.credit_limit
          : 1
      const statement = nextStatementDate(card, purchaseDate)
      const daysOfFloat = Math.max(
        0,
        Math.round(
          (statement.getTime() - startOfDay(purchaseDate).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
      const fits = available >= amount
      // Score: float (mayor mejor) + bonus si entra; penaliza utilización alta
      const score =
        (fits ? 1000 : 0) + daysOfFloat * 10 - utilizationAfter * 50
      return {
        card,
        available,
        utilizationAfter,
        statement,
        daysOfFloat,
        fits,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)

  const best = candidates[0]
  if (!best || !best.fits) {
    const top = best?.card
    return {
      cardId: top?.id ?? null,
      card: top,
      daysOfFloat: best?.daysOfFloat ?? 0,
      reason: top
        ? `Ninguna tarjeta tiene cupo suficiente. La opción menos peor sería ${top.name} (cupo disponible ${best?.available ?? 0}).`
        : 'Ninguna tarjeta tiene cupo suficiente.',
      newAvailableLimit: best ? best.available - amount : undefined,
      utilizationAfter: best?.utilizationAfter,
    }
  }

  const payment = nextPaymentDueDate(best.card, best.statement)
  return {
    cardId: best.card.id,
    card: best.card,
    daysOfFloat: best.daysOfFloat,
    newAvailableLimit: round(best.available - amount),
    utilizationAfter: round100(best.utilizationAfter),
    reason: `${best.card.name}: ${best.daysOfFloat} días hasta el próximo corte (${formatShort(best.statement)}). Pagarías alrededor del ${formatShort(payment)}.`,
  }
}

// =====================================================================
// Helpers
// =====================================================================

function round(v: number): number {
  return Math.round(v * 100) / 100
}

function round100(v: number): number {
  return Math.round(v * 1000) / 1000
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

export { daysFromToday }
