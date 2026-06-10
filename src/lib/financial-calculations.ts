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
      credit_card_id: null,
      sequence: i + 1,
      due_date: toISODate(due),
      amount: round(debt.approx_installment_amount),
      status: 'pending',
      paid_transaction_id: null,
      paid_at: null,
    })
  }
  return out
}

type NewInstallment = Omit<DebtInstallmentRow, 'id' | 'created_at' | 'updated_at'>

/** Frecuencias soportadas para un calendario de cuotas (prompt 6.md). */
export type InstallmentFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom_days'

/**
 * Valor de cada cuota dividiendo el total entre el número de cuotas.
 * Si hay interés (tasa anual), aplica un recargo simple proporcional al plazo
 * mensual estimado. La última cuota absorbe el redondeo (se calcula fuera).
 */
export function calculateInstallmentAmount(
  total: number,
  count: number,
  options: { annualInterestRate?: number } = {},
): number {
  if (count <= 0) return 0
  const rate = options.annualInterestRate ?? 0
  if (rate <= 0) return round(total / count)
  // interés simple sobre el plazo (count meses como aproximación)
  const monthlyRate = rate / 100 / 12
  const withInterest = total * (1 + monthlyRate * count)
  return round(withInterest / count)
}

/**
 * Genera un calendario de cuotas genérico (deuda O tarjeta). Función canónica;
 * `generateDebtInstallments` y `generateCardInstallments` se apoyan en ella.
 */
export function generateInstallmentSchedule(params: {
  userId: string
  debtId?: string | null
  creditCardId?: string | null
  count: number
  amount: number
  firstDueDate: string
  frequency: InstallmentFrequency
  customDays?: number
}): NewInstallment[] {
  const {
    userId,
    debtId = null,
    creditCardId = null,
    count,
    amount,
    firstDueDate,
    frequency,
    customDays = 30,
  } = params
  if (count <= 0 || !firstDueDate) return []
  const start = fromISODate(firstDueDate)
  const out: NewInstallment[] = []
  for (let i = 0; i < count; i += 1) {
    let due: Date
    if (i === 0) due = start
    else if (frequency === 'custom_days') due = addDays(start, customDays * i)
    else if (frequency === 'biweekly') due = addDays(start, 14 * i)
    else if (frequency === 'weekly') due = advanceByFrequency(start, 'weekly', i)
    else due = advanceByFrequency(start, 'monthly', i)
    out.push({
      user_id: userId,
      debt_id: debtId,
      credit_card_id: creditCardId,
      sequence: i + 1,
      due_date: toISODate(due),
      amount: round(amount),
      status: 'pending',
      paid_transaction_id: null,
      paid_at: null,
    })
  }
  return out
}

/**
 * Cuotas para una compra con tarjeta a cuotas (prompt 6.md punto 7).
 * Genera registros mensuales en debt_installments ligados a la tarjeta.
 */
export function generateCardInstallments(params: {
  userId: string
  creditCardId: string
  total: number
  count: number
  firstDueDate: string
  annualInterestRate?: number
}): NewInstallment[] {
  const amount = calculateInstallmentAmount(params.total, params.count, {
    annualInterestRate: params.annualInterestRate,
  })
  return generateInstallmentSchedule({
    userId: params.userId,
    creditCardId: params.creditCardId,
    debtId: null,
    count: params.count,
    amount,
    firstDueDate: params.firstDueDate,
    frequency: 'monthly',
  })
}

/**
 * Marca una cuota como pagada (función pura: devuelve el nuevo estado de la
 * cuota). El efecto sobre saldos lo aplica la RPC pay_installment.
 */
export function markInstallmentAsPaid(
  installment: Pick<DebtInstallmentRow, 'status'>,
  options: { paidAt: string; transactionId?: string | null } = { paidAt: '' },
): Pick<DebtInstallmentRow, 'status' | 'paid_at' | 'paid_transaction_id'> {
  return {
    status: 'paid',
    paid_at: options.paidAt || null,
    paid_transaction_id: options.transactionId ?? null,
  }
}

/**
 * Detecta cuotas vencidas: pendientes cuya fecha ya pasó respecto a asOf.
 * Devuelve los ids que deberían marcarse 'overdue'.
 */
export function detectLateInstallments(
  installments: Pick<DebtInstallmentRow, 'id' | 'due_date' | 'status'>[],
  asOf: Date = today(),
): string[] {
  const ref = startOfDay(asOf)
  return installments
    .filter((i) => i.status === 'pending' && fromISODate(i.due_date) < ref)
    .map((i) => i.id)
}

/**
 * Recalcula el progreso de una deuda a partir de sus cuotas: cuántas pagadas,
 * cuántas restan, monto restante y fracción de avance (0..1).
 */
export function recalculateDebtProgress(
  totalAmount: number,
  installments: Pick<DebtInstallmentRow, 'amount' | 'status'>[],
): {
  paidCount: number
  remainingCount: number
  paidAmount: number
  remainingAmount: number
  progress: number
} {
  const paid = installments.filter((i) => i.status === 'paid')
  const remaining = installments.filter((i) => i.status !== 'paid')
  const paidAmount = round(paid.reduce((a, i) => a + Number(i.amount), 0))
  const remainingAmount = round(
    remaining.reduce((a, i) => a + Number(i.amount), 0),
  )
  const total = totalAmount > 0 ? totalAmount : paidAmount + remainingAmount
  const progress = total > 0 ? round(paidAmount / total) : 0
  return {
    paidCount: paid.length,
    remainingCount: remaining.length,
    paidAmount,
    remainingAmount,
    progress: Math.min(1, Math.max(0, progress)),
  }
}

/**
 * Saldo pendiente de una deuda derivado de sus cuotas: suma de las que no están
 * pagadas. Es la fuente de verdad del saldo cuando la deuda tiene cuotas.
 */
export function debtRemainingFromInstallments(
  installments: Pick<DebtInstallmentRow, 'amount' | 'status'>[],
): number {
  return round(
    installments
      .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
      .reduce((a, i) => a + Number(i.amount), 0),
  )
}

/**
 * Saldo derivado de una tarjeta de crédito: lo mismo que calcula la BD en
 * recompute_card_debt. Útil para UI optimista y tests.
 *   current_debt = opening_balance + Σ cargos − Σ pagos  (nunca negativo)
 */
export function computeCardDebt(params: {
  openingBalance: number
  charges: number
  payments: number
}): number {
  return round(
    Math.max(
      0,
      Number(params.openingBalance) +
        Number(params.charges) -
        Number(params.payments),
    ),
  )
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
    // Las CESANTÍAS (capital) no se consignan a la cuenta: van a un fondo.
    // Se excluyen del saldo proyectado (sí se muestran en la sección de
    // prestaciones del año). Los intereses de cesantías SÍ entran.
    if (sp.type === 'cesantias') continue
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
  // daysUntil/status se miden relativo a `start` (no a la fecha real del sistema),
  // para que el cálculo sea determinista y respete asOfDate.
  const daysUntilFrom = (iso: string) =>
    Math.round((fromISODate(iso).getTime() - start.getTime()) / 86_400_000)

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
      daysUntil: daysUntilFrom(inst.due_date),
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
      daysUntil: daysUntilFrom(iso),
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
        daysUntil: daysUntilFrom(occ.date),
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
    // Cesantías capital no entran como ingreso a la cuenta (van al fondo).
    if (sp.type === 'cesantias') continue
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
// Simulador de compra (prompt 7.md)
// =====================================================================

export type PurchaseRisk = 'low' | 'medium' | 'high'
export type PurchaseVerdict = 'buy' | 'wait' | 'cannot'

export interface CashSimulationResult {
  canAfford: boolean
  balanceAfter: number
  /** ¿Queda por debajo del colchón de emergencia? */
  belowEmergencyMinimum: boolean
  /** ¿El saldo restante no cubre los pagos próximos comprometidos? */
  conflictsWithUpcoming: boolean
  risk: PurchaseRisk
  reason: string
}

export interface CardSimulationResult {
  cardId: string | null
  canAfford: boolean
  availableAfter: number
  utilizationAfter: number
  daysOfFloat: number
  /** Fecha estimada en la que realmente pagarías (próximo vencimiento tras el corte). */
  realPaymentDate: string | null
  risk: PurchaseRisk
  reason: string
}

export interface RankedPaymentOption {
  method: 'cash' | 'account' | 'card'
  refId: string | null
  label: string
  canAfford: boolean
  risk: PurchaseRisk
  score: number
  reason: string
}

/** Días entre la compra y la fecha real de pago (próximo vencimiento). */
export function calculateDaysUntilPayment(
  card: Pick<CreditCardRow, 'statement_day' | 'payment_due_day'>,
  purchaseDate: Date = today(),
): number {
  const statement = nextStatementDate(card, purchaseDate)
  const payment = nextPaymentDueDate(card, statement)
  return Math.max(
    0,
    Math.round(
      (startOfDay(payment).getTime() - startOfDay(purchaseDate).getTime()) /
        86_400_000,
    ),
  )
}

/**
 * Impacto de la fecha de corte: ¿la compra entra antes o después del próximo
 * corte? y días de financiación sin interés hasta el pago.
 */
export function calculateCardCutoffImpact(
  card: Pick<CreditCardRow, 'statement_day' | 'payment_due_day'>,
  purchaseDate: Date = today(),
): {
  statementDate: string
  paymentDate: string
  daysUntilStatement: number
  interestFreeDays: number
} {
  const statement = nextStatementDate(card, purchaseDate)
  const payment = nextPaymentDueDate(card, statement)
  const daysUntilStatement = Math.max(
    0,
    Math.round(
      (startOfDay(statement).getTime() - startOfDay(purchaseDate).getTime()) /
        86_400_000,
    ),
  )
  const interestFreeDays = Math.max(
    0,
    Math.round(
      (startOfDay(payment).getTime() - startOfDay(purchaseDate).getTime()) /
        86_400_000,
    ),
  )
  return {
    statementDate: toISODate(statement),
    paymentDate: toISODate(payment),
    daysUntilStatement,
    interestFreeDays,
  }
}

/**
 * Simula pagar con cuenta/efectivo: saldo después, colchón de emergencia y
 * choque con pagos próximos. El riesgo escala según cuánto margen queda.
 */
export function simulateCashPurchase(input: {
  amount: number
  availableBalance: number
  emergencyMinimum?: number
  upcomingCommitted?: number
}): CashSimulationResult {
  const amount = Number(input.amount)
  const balance = Number(input.availableBalance)
  const emergency = input.emergencyMinimum ?? 0
  const committed = input.upcomingCommitted ?? 0
  const balanceAfter = round(balance - amount)
  const canAfford = balanceAfter >= 0
  const belowEmergencyMinimum = balanceAfter < emergency
  const conflictsWithUpcoming = balanceAfter < committed

  let risk: PurchaseRisk = 'low'
  if (!canAfford) risk = 'high'
  else if (conflictsWithUpcoming || belowEmergencyMinimum) risk = 'high'
  else if (balanceAfter < emergency + committed) risk = 'medium'

  const reason = !canAfford
    ? 'No te alcanza el saldo disponible.'
    : conflictsWithUpcoming
      ? 'Quedarías sin cubrir tus pagos próximos.'
      : belowEmergencyMinimum
        ? 'Bajarías de tu mínimo de emergencia.'
        : risk === 'medium'
          ? 'Puedes, pero quedarías con poco margen.'
          : 'Puedes pagarlo con holgura.'

  return {
    canAfford,
    balanceAfter,
    belowEmergencyMinimum,
    conflictsWithUpcoming,
    risk,
    reason,
  }
}

/**
 * Simula pagar con una tarjeta específica: cupo después, utilización, float y
 * fecha real de pago. Riesgo según cupo y utilización resultante.
 */
export function simulateCreditCardPurchase(input: {
  amount: number
  card: CreditCardRow
  purchaseDate?: Date
}): CardSimulationResult {
  const amount = Number(input.amount)
  const card = input.card
  const purchaseDate = input.purchaseDate ?? today()
  const available = calculateAvailableCardLimit(card)
  const availableAfter = round(available - amount)
  const canAfford = availableAfter >= 0
  const utilizationAfter =
    card.credit_limit > 0
      ? round100((Number(card.current_debt) + amount) / card.credit_limit)
      : 1
  const cutoff = calculateCardCutoffImpact(card, purchaseDate)

  let risk: PurchaseRisk = 'low'
  if (!canAfford) risk = 'high'
  else if (utilizationAfter > 0.8) risk = 'high'
  else if (utilizationAfter > 0.5) risk = 'medium'

  const reason = !canAfford
    ? `Supera el cupo disponible de ${card.name}.`
    : `${card.name}: ${cutoff.interestFreeDays} días sin interés, utilización ${Math.round(utilizationAfter * 100)}%.`

  return {
    cardId: card.id,
    canAfford,
    availableAfter,
    utilizationAfter,
    daysOfFloat: cutoff.daysUntilStatement,
    realPaymentDate: cutoff.paymentDate,
    risk,
    reason,
  }
}

/** Nivel de riesgo global combinando los factores de la simulación elegida. */
export function calculatePurchaseRisk(input: {
  canAfford: boolean
  necessary?: boolean
  belowEmergencyMinimum?: boolean
  conflictsWithUpcoming?: boolean
  utilizationAfter?: number
}): PurchaseRisk {
  if (!input.canAfford) return 'high'
  if (input.conflictsWithUpcoming || input.belowEmergencyMinimum) return 'high'
  if ((input.utilizationAfter ?? 0) > 0.8) return 'high'
  if ((input.utilizationAfter ?? 0) > 0.5) return 'medium'
  // una compra no necesaria con poco margen sube a riesgo medio
  if (input.necessary === false) return 'medium'
  return 'low'
}

/**
 * Ordena todas las formas de pago disponibles (efectivo, cuentas, tarjetas) de
 * mejor a peor para una compra. Menor riesgo y mayor holgura ⇒ mejor score.
 */
export function rankPaymentOptions(input: {
  amount: number
  totalAvailable: number
  accounts: AccountRow[]
  cards: CreditCardRow[]
  emergencyMinimum?: number
  upcomingCommitted?: number
  purchaseDate?: Date
}): RankedPaymentOption[] {
  const riskScore: Record<PurchaseRisk, number> = { low: 100, medium: 50, high: 0 }
  const out: RankedPaymentOption[] = []

  const cash = simulateCashPurchase({
    amount: input.amount,
    availableBalance: input.totalAvailable,
    emergencyMinimum: input.emergencyMinimum,
    upcomingCommitted: input.upcomingCommitted,
  })
  out.push({
    method: 'cash',
    refId: null,
    label: 'Efectivo / disponible total',
    canAfford: cash.canAfford,
    risk: cash.risk,
    score: riskScore[cash.risk] + (cash.canAfford ? cash.balanceAfter / 1_000_000 : -1000),
    reason: cash.reason,
  })

  for (const acc of input.accounts.filter((a) => !a.archived)) {
    const sim = simulateCashPurchase({
      amount: input.amount,
      availableBalance: Number(acc.balance),
      emergencyMinimum: input.emergencyMinimum,
      upcomingCommitted: input.upcomingCommitted,
    })
    out.push({
      method: 'account',
      refId: acc.id,
      label: acc.name,
      canAfford: sim.canAfford,
      risk: sim.risk,
      score: riskScore[sim.risk] + (sim.canAfford ? sim.balanceAfter / 1_000_000 : -1000),
      reason: sim.reason,
    })
  }

  for (const card of input.cards.filter((c) => !c.archived)) {
    const sim = simulateCreditCardPurchase({
      amount: input.amount,
      card,
      purchaseDate: input.purchaseDate,
    })
    out.push({
      method: 'card',
      refId: card.id,
      label: card.name,
      canAfford: sim.canAfford,
      risk: sim.risk,
      // bonus por días de float (financiación sin interés)
      score:
        riskScore[sim.risk] +
        (sim.canAfford ? sim.daysOfFloat / 2 : -1000),
      reason: sim.reason,
    })
  }

  return out.sort((a, b) => b.score - a.score)
}

/**
 * Recomienda el mejor medio de pago y si conviene comprar ahora o esperar.
 * Devuelve la opción ganadora del ranking + veredicto + riesgo.
 */
export function recommendBestPaymentMethod(input: {
  amount: number
  totalAvailable: number
  accounts: AccountRow[]
  cards: CreditCardRow[]
  necessary?: boolean
  emergencyMinimum?: number
  upcomingCommitted?: number
  purchaseDate?: Date
}): {
  best: RankedPaymentOption | null
  ranked: RankedPaymentOption[]
  verdict: PurchaseVerdict
  risk: PurchaseRisk
  reason: string
} {
  const ranked = rankPaymentOptions(input)
  const affordable = ranked.filter((o) => o.canAfford)
  const best = affordable[0] ?? ranked[0] ?? null

  if (!best || !best.canAfford) {
    return {
      best,
      ranked,
      verdict: 'cannot',
      risk: 'high',
      reason: 'Ningún medio de pago cubre esta compra ahora mismo.',
    }
  }

  const risk = best.risk
  // No necesaria + riesgo medio/alto ⇒ mejor esperar.
  const verdict: PurchaseVerdict =
    risk === 'high' || (input.necessary === false && risk !== 'low')
      ? 'wait'
      : 'buy'

  const reason =
    verdict === 'wait'
      ? input.necessary === false
        ? 'No es una compra necesaria y el margen es ajustado: mejor espera.'
        : 'El margen es ajustado: considera esperar.'
      : `Mejor opción: ${best.label}. ${best.reason}`

  return { best, ranked, verdict, risk, reason }
}

// =====================================================================
// Transacciones: efecto puro sobre saldos (prompt 4/5.md)
// =====================================================================
//
// Estas funciones NO tocan Supabase: describen, de forma testeable, cómo
// cambia el estado financiero ante cada transacción. La RPC SQL
// create_financial_transaction aplica el mismo efecto del lado servidor; la
// UI las usa para mostrar el "detalle de impacto" y validar antes de enviar.

export type BalanceDelta =
  | { entity: 'account'; id: string; delta: number }
  | { entity: 'account'; id: string; setTo: number }
  | { entity: 'card'; id: string; delta: number }
  | { entity: 'debt'; id: string; delta: number }

export interface TransactionImpact {
  /** Cambios sobre saldos (cuentas, deuda de tarjeta, saldo de deuda). */
  deltas: BalanceDelta[]
  /** Cambio neto en el patrimonio líquido (negativo = empeora). */
  netWorthChange: number
  /** Texto corto legible del impacto. */
  summary: string
}

/** ¿Hay saldo suficiente en la cuenta para cubrir el monto? */
export function validateSufficientBalance(
  accountBalance: number,
  amount: number,
): boolean {
  return Number(accountBalance) >= Number(amount)
}

/** Ingreso: aumenta el saldo de la cuenta. */
export function applyIncomeTransaction(
  accountBalance: number,
  amount: number,
): number {
  return round(Number(accountBalance) + Number(amount))
}

/** Gasto: disminuye el saldo de la cuenta. */
export function applyExpenseTransaction(
  accountBalance: number,
  amount: number,
): number {
  return round(Number(accountBalance) - Number(amount))
}

/** Pago de deuda: baja el saldo pendiente de la deuda (nunca < 0). */
export function applyDebtPaymentTransaction(
  remainingBalance: number,
  amount: number,
): number {
  return round(Math.max(0, Number(remainingBalance) - Number(amount)))
}

/**
 * Pago de tarjeta: baja la deuda de la tarjeta. No permite sobrepago:
 * si el monto supera la deuda actual, lanza error (regla del prompt 4/5.md).
 */
export function applyCreditCardPaymentTransaction(
  currentDebt: number,
  amount: number,
): number {
  if (Number(amount) > Number(currentDebt)) {
    throw new Error('No puedes pagar más que la deuda actual de la tarjeta')
  }
  return round(Number(currentDebt) - Number(amount))
}

/**
 * Transferencia: mueve dinero entre dos cuentas. Valida saldo suficiente en
 * origen y NO cambia el patrimonio total.
 */
export function applyTransferTransaction(
  fromBalance: number,
  toBalance: number,
  amount: number,
): { from: number; to: number } {
  if (!validateSufficientBalance(fromBalance, amount)) {
    throw new Error('Saldo insuficiente en la cuenta origen')
  }
  return {
    from: round(Number(fromBalance) - Number(amount)),
    to: round(Number(toBalance) + Number(amount)),
  }
}

/**
 * Ajuste: corrige manualmente el saldo de una cuenta fijándolo a un valor.
 * Devuelve el nuevo saldo (= targetBalance) y el delta aplicado.
 */
export function applyAdjustmentTransaction(
  currentBalance: number,
  targetBalance: number,
): { newBalance: number; delta: number } {
  return {
    newBalance: round(Number(targetBalance)),
    delta: round(Number(targetBalance) - Number(currentBalance)),
  }
}

/**
 * Describe el impacto financiero de una transacción sin ejecutarla.
 * Útil para el "detalle de impacto" en la UI antes de confirmar.
 */
export function calculateTransactionImpact(input: {
  kind: import('@/types/database').TransactionKind
  amount: number
  accountId?: string | null
  counterpartyAccountId?: string | null
  cardId?: string | null
  debtId?: string | null
  currentAccountBalance?: number
}): TransactionImpact {
  const amount = Number(input.amount)
  const deltas: BalanceDelta[] = []
  let netWorthChange = 0
  let summary = ''

  switch (input.kind) {
    case 'income':
      if (input.accountId) deltas.push({ entity: 'account', id: input.accountId, delta: amount })
      netWorthChange = amount
      summary = `Ingreso de ${amount}`
      break
    case 'expense':
      if (input.cardId) {
        deltas.push({ entity: 'card', id: input.cardId, delta: amount })
        netWorthChange = -amount
        summary = `Gasto de ${amount} a la tarjeta (aumenta deuda)`
      } else if (input.accountId) {
        deltas.push({ entity: 'account', id: input.accountId, delta: -amount })
        netWorthChange = -amount
        summary = `Gasto de ${amount} desde la cuenta`
      }
      break
    case 'debt_payment':
      if (input.accountId) deltas.push({ entity: 'account', id: input.accountId, delta: -amount })
      if (input.debtId) deltas.push({ entity: 'debt', id: input.debtId, delta: -amount })
      // baja efectivo y deuda a la vez: patrimonio neto no cambia
      netWorthChange = 0
      summary = `Pago de deuda por ${amount}`
      break
    case 'card_payment':
      if (input.accountId) deltas.push({ entity: 'account', id: input.accountId, delta: -amount })
      if (input.cardId) deltas.push({ entity: 'card', id: input.cardId, delta: -amount })
      netWorthChange = 0
      summary = `Pago de tarjeta por ${amount}`
      break
    case 'transfer':
      if (input.accountId) deltas.push({ entity: 'account', id: input.accountId, delta: -amount })
      if (input.counterpartyAccountId)
        deltas.push({ entity: 'account', id: input.counterpartyAccountId, delta: amount })
      netWorthChange = 0
      summary = `Transferencia de ${amount} entre cuentas`
      break
    case 'adjustment':
      if (input.accountId) {
        const delta =
          input.currentAccountBalance !== undefined
            ? amount - Number(input.currentAccountBalance)
            : 0
        deltas.push({ entity: 'account', id: input.accountId, setTo: amount })
        netWorthChange = delta
        summary = `Ajuste de saldo a ${amount}`
      }
      break
  }

  return { deltas, netWorthChange: round(netWorthChange), summary }
}

// =====================================================================
// Agregaciones para el dashboard (gasto por categoría, salud financiera)
// =====================================================================

export interface CategorySpend {
  categoryId: string | null
  name: string
  color: string | null
  icon: string | null
  amount: number
  /** Fracción del total de gasto (0..1). */
  share: number
}

/**
 * Agrupa los GASTOS por categoría en una ventana, ordenados de mayor a menor.
 * Útil para "¿en qué gastas más?". Las transacciones sin categoría se agrupan
 * bajo "Sin categoría".
 */
export function aggregateSpendingByCategory(
  transactions: {
    kind: string
    amount: number
    category_id: string | null
    date: string
  }[],
  categories: { id: string; name: string; color: string | null; icon: string | null }[],
  options: {
    from?: string
    to?: string
    limit?: number
    /** Qué tipos agregar. Por defecto solo gastos. */
    kinds?: string[]
  } = {},
): CategorySpend[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string | null, number>()
  const kinds = options.kinds ?? ['expense']

  for (const t of transactions) {
    if (!kinds.includes(t.kind)) continue
    if (options.from && t.date < options.from) continue
    if (options.to && t.date > options.to) continue
    const key = t.category_id ?? null
    totals.set(key, (totals.get(key) ?? 0) + Number(t.amount))
  }

  const grandTotal = Array.from(totals.values()).reduce((a, b) => a + b, 0)
  const out: CategorySpend[] = Array.from(totals.entries()).map(([id, amount]) => {
    const cat = id ? byId.get(id) : undefined
    return {
      categoryId: id,
      name: cat?.name ?? 'Sin categoría',
      color: cat?.color ?? null,
      icon: cat?.icon ?? null,
      amount: round(amount),
      share: grandTotal > 0 ? round100(amount / grandTotal) : 0,
    }
  })

  out.sort((a, b) => b.amount - a.amount)
  return typeof options.limit === 'number' ? out.slice(0, options.limit) : out
}

export interface FinancialHealth {
  /** Patrimonio líquido (puede ser negativo). */
  netWorth: number
  /** Deuda total / (disponible + deuda). 0 = sin deuda, 1 = todo es deuda. */
  debtRatio: number
  /** Utilización media de tarjetas (0..1). */
  avgCardUtilization: number
  /** Tasa de ahorro del periodo: (ingresos − gastos) / ingresos. */
  savingsRate: number
  /** Puntaje 0-100 (heurística) y etiqueta. */
  score: number
  label: 'excelente' | 'buena' | 'regular' | 'frágil'
}

/**
 * Resumen de salud financiera para el dashboard. Combina patrimonio, ratio de
 * deuda, utilización de tarjetas y tasa de ahorro en un puntaje 0-100.
 */
export function calculateFinancialHealth(input: {
  totalAvailable: number
  totalDebt: number
  netWorth: number
  cards: { credit_limit: number; current_debt: number; archived: boolean }[]
  periodIncome: number
  periodExpense: number
}): FinancialHealth {
  const denom = input.totalAvailable + input.totalDebt
  const debtRatio = denom > 0 ? round100(input.totalDebt / denom) : 0

  const activeCards = input.cards.filter((c) => !c.archived && c.credit_limit > 0)
  const avgCardUtilization =
    activeCards.length > 0
      ? round100(
          activeCards.reduce((a, c) => a + c.current_debt / c.credit_limit, 0) /
            activeCards.length,
        )
      : 0

  const savingsRate =
    input.periodIncome > 0
      ? round100((input.periodIncome - input.periodExpense) / input.periodIncome)
      : 0

  // Puntaje: parte de 100 y penaliza deuda alta, utilización alta y ahorro bajo/negativo.
  let score = 100
  score -= debtRatio * 40 // hasta -40 por deuda
  score -= avgCardUtilization * 25 // hasta -25 por utilización
  if (savingsRate < 0) score -= 25
  else score -= (1 - Math.min(1, savingsRate)) * 15 // hasta -15 si no ahorras
  if (input.netWorth < 0) score -= 15
  score = Math.max(0, Math.min(100, Math.round(score)))

  const label: FinancialHealth['label'] =
    score >= 80 ? 'excelente' : score >= 60 ? 'buena' : score >= 40 ? 'regular' : 'frágil'

  return {
    netWorth: round(input.netWorth),
    debtRatio,
    avgCardUtilization,
    savingsRate,
    score,
    label,
  }
}

/** Totales de ingreso y gasto reales en una ventana (para "ingresos vs gastos"). */
export function sumIncomeVsExpense(
  transactions: { kind: string; amount: number; date: string }[],
  options: { from?: string; to?: string } = {},
): { income: number; expense: number; net: number } {
  let income = 0
  let expense = 0
  for (const t of transactions) {
    if (options.from && t.date < options.from) continue
    if (options.to && t.date > options.to) continue
    if (t.kind === 'income') income += Number(t.amount)
    else if (t.kind === 'expense') expense += Number(t.amount)
  }
  return { income: round(income), expense: round(expense), net: round(income - expense) }
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
