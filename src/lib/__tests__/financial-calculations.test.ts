import { describe, it, expect } from 'vitest'
import {
  calculateAvailableCardLimit,
  calculateBiweeklySalary,
  calculateCesantiasInterest,
  calculateEstimatedPrima,
  calculateLiquidNetWorth,
  calculateNetWorth,
  calculateTotalAvailableMoney,
  calculateTotalCreditCardDebt,
  calculateTotalDebt,
  calculateUpcomingPayments,
  calculateUpcomingIncome,
  calculateSafeSpendingCapacity,
  generateDebtInstallments,
  projectFutureBalance,
  recommendCardForPurchase,
} from '../financial-calculations'
import type {
  AccountRow,
  CreditCardRow,
  DebtInstallmentRow,
  DebtRow,
  RecurringTransactionRow,
  SalaryPeriodRow,
} from '@/types/database'

const card = (
  overrides: Partial<CreditCardRow> = {},
): CreditCardRow => ({
  id: overrides.id ?? 'c1',
  user_id: 'u1',
  name: overrides.name ?? 'Card',
  bank: 'Bank',
  credit_limit: overrides.credit_limit ?? 1_000_000,
  opening_balance: overrides.opening_balance ?? overrides.current_debt ?? 0,
  current_debt: overrides.current_debt ?? 0,
  statement_day: overrides.statement_day ?? 15,
  payment_due_day: overrides.payment_due_day ?? 5,
  color: '#000',
  notes: null,
  archived: overrides.archived ?? false,
  created_at: '',
  updated_at: '',
})

describe('reglas laborales Colombia', () => {
  it('biweekly = monthly / 2', () => {
    expect(calculateBiweeklySalary(2_000_000)).toBe(1_000_000)
    expect(calculateBiweeklySalary(0)).toBe(0)
  })

  it('prima = salary * days / 360', () => {
    expect(calculateEstimatedPrima(1_800_000, 180)).toBe(900_000)
    expect(calculateEstimatedPrima(0, 90)).toBe(0)
  })

  it('intereses cesantías = capital * 0.12 * days / 360', () => {
    expect(calculateCesantiasInterest(1_000_000, 360)).toBe(120_000)
    expect(calculateCesantiasInterest(1_000_000, 180)).toBe(60_000)
  })
})

describe('agregados', () => {
  it('cupo disponible de tarjeta', () => {
    expect(
      calculateAvailableCardLimit({ credit_limit: 1_000_000, current_debt: 250_000 }),
    ).toBe(750_000)
    expect(
      calculateAvailableCardLimit({ credit_limit: 100, current_debt: 200 }),
    ).toBe(0)
  })

  it('deuda total suma deudas + tarjetas activas', () => {
    const debts: DebtRow[] = [
      { remaining_balance: 100, archived: false } as DebtRow,
      { remaining_balance: 50, archived: true } as DebtRow,
    ]
    const cards: CreditCardRow[] = [
      card({ current_debt: 25 }),
      card({ current_debt: 100, archived: true }),
    ]
    expect(calculateTotalDebt(debts, cards)).toBe(125)
  })

  it('dinero disponible suma cuentas activas', () => {
    const accs: AccountRow[] = [
      { balance: 500, archived: false } as AccountRow,
      { balance: 200, archived: true } as AccountRow,
    ]
    expect(calculateTotalAvailableMoney(accs)).toBe(500)
  })

  it('patrimonio líquido = disponible - deuda', () => {
    expect(
      calculateLiquidNetWorth(
        [{ balance: 1000, archived: false } as AccountRow],
        [card({ current_debt: 100 })],
        [{ remaining_balance: 200, archived: false } as DebtRow],
      ),
    ).toBe(700)
  })
})

describe('cuotas de deuda', () => {
  it('genera N cuotas mensuales desde next_payment_date', () => {
    const out = generateDebtInstallments({
      id: 'd1',
      user_id: 'u1',
      remaining_installments: 3,
      approx_installment_amount: 500,
      next_payment_date: '2026-07-15',
      payment_frequency: 'monthly',
    })
    expect(out).toHaveLength(3)
    expect(out[0].due_date).toBe('2026-07-15')
    expect(out[1].due_date).toBe('2026-08-15')
    expect(out[2].due_date).toBe('2026-09-15')
    expect(out[0].amount).toBe(500)
  })
})

describe('proyección de saldo', () => {
  it('aplica ingresos y gastos recurrentes en orden cronológico', () => {
    const asOfDate = new Date('2026-06-01T00:00:00')
    const recurring: RecurringTransactionRow[] = [
      {
        id: 'r1',
        user_id: 'u1',
        name: 'Arriendo',
        kind: 'expense',
        amount: 1_000_000,
        category_id: null,
        account_id: null,
        credit_card_id: null,
        debt_id: null,
        frequency: 'monthly',
        interval_count: 1,
        start_date: '2026-06-05',
        end_date: null,
        next_occurrence_date: '2026-06-05',
        active: true,
        notes: null,
        created_at: '',
        updated_at: '',
      },
    ]
    const installments: DebtInstallmentRow[] = []
    const salaryPeriods: SalaryPeriodRow[] = [
      {
        id: 's1',
        user_id: 'u1',
        income_source_id: 'i1',
        period_start: '2026-06-01',
        period_end: '2026-06-15',
        expected_amount: 1_500_000,
        actual_amount: null,
        type: 'regular',
        created_at: '',
        updated_at: '',
      },
    ]
    const out = projectFutureBalance({
      startBalance: 500_000,
      asOfDate,
      horizonDays: 30,
      recurring,
      installments,
      salaryPeriods,
    })
    expect(out).toHaveLength(2)
    expect(out[0].date).toBe('2026-06-05')
    expect(out[0].runningBalance).toBe(-500_000)
    expect(out[1].date).toBe('2026-06-15')
    expect(out[1].runningBalance).toBe(1_000_000)
  })
})

describe('recomendación de tarjeta', () => {
  it('elige la tarjeta con mayor float que tenga cupo', () => {
    const purchaseDate = new Date('2026-06-01T00:00:00')
    const cards: CreditCardRow[] = [
      card({
        id: 'short',
        name: 'Float corto',
        statement_day: 5,
        payment_due_day: 25,
        credit_limit: 5_000_000,
        current_debt: 0,
      }),
      card({
        id: 'long',
        name: 'Float largo',
        statement_day: 28,
        payment_due_day: 18,
        credit_limit: 5_000_000,
        current_debt: 0,
      }),
    ]
    const out = recommendCardForPurchase(500_000, purchaseDate, cards)
    expect(out.cardId).toBe('long')
  })

  it('si nadie tiene cupo suficiente, devuelve la mejor con cardId y reason', () => {
    const purchaseDate = new Date('2026-06-01T00:00:00')
    const cards: CreditCardRow[] = [
      card({ id: 'a', credit_limit: 100, current_debt: 90 }),
      card({ id: 'b', credit_limit: 50, current_debt: 50 }),
    ]
    const out = recommendCardForPurchase(1_000_000, purchaseDate, cards)
    expect(out.cardId).not.toBeNull()
    expect(out.reason).toMatch(/no tiene|menos peor/i)
  })

  it('sin tarjetas, responde sin sugerencia', () => {
    const out = recommendCardForPurchase(100, new Date(), [])
    expect(out.cardId).toBeNull()
  })
})

const recurring = (
  overrides: Partial<RecurringTransactionRow> = {},
): RecurringTransactionRow => ({
  id: overrides.id ?? 'r1',
  user_id: 'u1',
  name: overrides.name ?? 'Recurrente',
  kind: overrides.kind ?? 'expense',
  amount: overrides.amount ?? 100,
  category_id: null,
  account_id: null,
  credit_card_id: null,
  debt_id: null,
  frequency: overrides.frequency ?? 'monthly',
  interval_count: overrides.interval_count ?? 1,
  start_date: overrides.start_date ?? '2026-06-01',
  end_date: overrides.end_date ?? null,
  next_occurrence_date: overrides.next_occurrence_date ?? '2026-06-10',
  active: overrides.active ?? true,
  notes: null,
  created_at: '',
  updated_at: '',
})

describe('prompt 2.md — indicadores del dashboard', () => {
  it('calculateTotalCreditCardDebt suma solo tarjetas no archivadas', () => {
    expect(
      calculateTotalCreditCardDebt([
        card({ current_debt: 100 }),
        card({ current_debt: 50 }),
        card({ current_debt: 999, archived: true }),
      ]),
    ).toBe(150)
  })

  it('calculateNetWorth es alias de calculateLiquidNetWorth', () => {
    const accs: AccountRow[] = [
      {
        id: 'a',
        user_id: 'u1',
        name: 'Caja',
        type: 'cash',
        balance: 1000,
        institution: null,
        color: '#000',
        notes: null,
        archived: false,
        created_at: '',
        updated_at: '',
      },
    ]
    const cards: CreditCardRow[] = [card({ current_debt: 200 })]
    const debts: DebtRow[] = []
    expect(calculateNetWorth(accs, cards, debts)).toBe(
      calculateLiquidNetWorth(accs, cards, debts),
    )
    expect(calculateNetWorth(accs, cards, debts)).toBe(800)
  })

  it('calculateUpcomingPayments ordena por fecha y marca estado', () => {
    const asOf = new Date('2026-06-01T00:00:00')
    const out = calculateUpcomingPayments(
      {
        installments: [
          { debt_id: 'd1', due_date: '2026-06-02', amount: 300, status: 'pending' },
          { debt_id: 'd1', due_date: '2026-05-30', amount: 100, status: 'pending' },
          { debt_id: 'd1', due_date: '2026-06-20', amount: 50, status: 'paid' },
        ],
        debts: [{ id: 'd1', name: 'Préstamo' }],
        cards: [],
        recurring: [],
      },
      { asOfDate: asOf, soonWindow: 3 },
    )
    expect(out.map((p) => p.date)).toEqual(['2026-05-30', '2026-06-02'])
    expect(out[0].status).toBe('overdue')
    expect(out[1].status).toBe('soon')
  })

  it('calculateUpcomingIncome incluye salarios esperados y recurrentes income', () => {
    const asOf = new Date('2026-06-01T00:00:00')
    const out = calculateUpcomingIncome(
      {
        salaryPeriods: [
          {
            period_end: '2026-06-15',
            expected_amount: 2_000_000,
            actual_amount: null,
            type: 'regular',
          },
          {
            period_end: '2026-06-20',
            expected_amount: 999,
            actual_amount: 999,
            type: 'regular',
          },
        ],
        recurring: [recurring({ kind: 'income', amount: 500, next_occurrence_date: '2026-06-10' })],
      },
      { asOfDate: asOf },
    )
    expect(out.length).toBe(2)
    expect(out[0].date).toBe('2026-06-10')
    expect(out.some((i) => i.amount === 999)).toBe(false)
  })

  it('calculateSafeSpendingCapacity descuenta compromisos y colchón, nunca negativo', () => {
    expect(
      calculateSafeSpendingCapacity({
        available: 1000,
        upcomingPayments: [{ amount: 300 }, { amount: 200 }],
        safetyBuffer: 100,
      }),
    ).toBe(400)
    expect(
      calculateSafeSpendingCapacity({
        available: 100,
        upcomingPayments: [{ amount: 500 }],
      }),
    ).toBe(0)
  })
})

import {
  applyIncomeTransaction,
  applyExpenseTransaction,
  applyDebtPaymentTransaction,
  applyCreditCardPaymentTransaction,
  applyTransferTransaction,
  applyAdjustmentTransaction,
  validateSufficientBalance,
  calculateTransactionImpact,
} from '../financial-calculations'

describe('transaction pure functions', () => {
  it('validateSufficientBalance', () => {
    expect(validateSufficientBalance(1000, 1000)).toBe(true)
    expect(validateSufficientBalance(1000, 1001)).toBe(false)
  })

  it('applyIncomeTransaction suma a la cuenta', () => {
    expect(applyIncomeTransaction(1000, 250)).toBe(1250)
  })

  it('applyExpenseTransaction resta de la cuenta', () => {
    expect(applyExpenseTransaction(1000, 250)).toBe(750)
  })

  it('applyDebtPaymentTransaction baja el saldo y no cae bajo 0', () => {
    expect(applyDebtPaymentTransaction(1000, 300)).toBe(700)
    expect(applyDebtPaymentTransaction(100, 300)).toBe(0)
  })

  it('applyCreditCardPaymentTransaction baja la deuda y bloquea sobrepago', () => {
    expect(applyCreditCardPaymentTransaction(1000, 400)).toBe(600)
    expect(() => applyCreditCardPaymentTransaction(300, 400)).toThrow()
  })

  it('applyTransferTransaction mueve dinero sin cambiar el total', () => {
    const r = applyTransferTransaction(1000, 200, 300)
    expect(r).toEqual({ from: 700, to: 500 })
    expect(r.from + r.to).toBe(1200)
    expect(() => applyTransferTransaction(100, 0, 300)).toThrow()
  })

  it('applyAdjustmentTransaction fija el saldo y reporta el delta', () => {
    expect(applyAdjustmentTransaction(800, 1000)).toEqual({ newBalance: 1000, delta: 200 })
    expect(applyAdjustmentTransaction(800, 500)).toEqual({ newBalance: 500, delta: -300 })
  })

  it('calculateTransactionImpact describe el impacto por tipo', () => {
    const income = calculateTransactionImpact({ kind: 'income', amount: 500, accountId: 'a1' })
    expect(income.netWorthChange).toBe(500)
    expect(income.deltas).toEqual([{ entity: 'account', id: 'a1', delta: 500 }])

    const transfer = calculateTransactionImpact({
      kind: 'transfer',
      amount: 300,
      accountId: 'a1',
      counterpartyAccountId: 'a2',
    })
    expect(transfer.netWorthChange).toBe(0)
    expect(transfer.deltas).toHaveLength(2)

    const cardExpense = calculateTransactionImpact({ kind: 'expense', amount: 200, cardId: 'c1' })
    expect(cardExpense.netWorthChange).toBe(-200)
    expect(cardExpense.deltas).toEqual([{ entity: 'card', id: 'c1', delta: 200 }])
  })
})

import {
  calculateInstallmentAmount,
  generateInstallmentSchedule,
  generateCardInstallments,
  markInstallmentAsPaid,
  detectLateInstallments,
  recalculateDebtProgress,
} from '../financial-calculations'

describe('installment pure functions', () => {
  it('calculateInstallmentAmount divide sin interés y con interés', () => {
    expect(calculateInstallmentAmount(1200, 12)).toBe(100)
    // con 12% anual a 12 meses: 1200 * (1 + 0.01*12) / 12 = 112
    expect(calculateInstallmentAmount(1200, 12, { annualInterestRate: 12 })).toBe(112)
    expect(calculateInstallmentAmount(1000, 0)).toBe(0)
  })

  it('generateInstallmentSchedule respeta frecuencia y conteo', () => {
    const monthly = generateInstallmentSchedule({
      userId: 'u1',
      debtId: 'd1',
      count: 3,
      amount: 100,
      firstDueDate: '2026-01-15',
      frequency: 'monthly',
    })
    expect(monthly).toHaveLength(3)
    expect(monthly.map((i) => i.due_date)).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ])
    expect(monthly[0].debt_id).toBe('d1')
    expect(monthly[0].credit_card_id).toBeNull()

    const weekly = generateInstallmentSchedule({
      userId: 'u1',
      count: 2,
      amount: 50,
      firstDueDate: '2026-01-01',
      frequency: 'weekly',
    })
    expect(weekly.map((i) => i.due_date)).toEqual(['2026-01-01', '2026-01-08'])

    const customDays = generateInstallmentSchedule({
      userId: 'u1',
      count: 2,
      amount: 50,
      firstDueDate: '2026-01-01',
      frequency: 'custom_days',
      customDays: 10,
    })
    expect(customDays.map((i) => i.due_date)).toEqual(['2026-01-01', '2026-01-11'])
  })

  it('generateCardInstallments liga las cuotas a la tarjeta', () => {
    const out = generateCardInstallments({
      userId: 'u1',
      creditCardId: 'card1',
      total: 600,
      count: 3,
      firstDueDate: '2026-02-01',
    })
    expect(out).toHaveLength(3)
    expect(out[0].credit_card_id).toBe('card1')
    expect(out[0].debt_id).toBeNull()
    expect(out[0].amount).toBe(200)
  })

  it('markInstallmentAsPaid devuelve estado pagado', () => {
    expect(
      markInstallmentAsPaid({ status: 'pending' }, { paidAt: '2026-03-01', transactionId: 'tx1' }),
    ).toEqual({ status: 'paid', paid_at: '2026-03-01', paid_transaction_id: 'tx1' })
  })

  it('detectLateInstallments encuentra pendientes vencidas', () => {
    const asOf = new Date('2026-06-10T00:00:00')
    const late = detectLateInstallments(
      [
        { id: 'a', due_date: '2026-06-01', status: 'pending' },
        { id: 'b', due_date: '2026-06-20', status: 'pending' },
        { id: 'c', due_date: '2026-05-01', status: 'paid' },
      ],
      asOf,
    )
    expect(late).toEqual(['a'])
  })

  it('recalculateDebtProgress calcula avance', () => {
    const r = recalculateDebtProgress(1000, [
      { amount: 250, status: 'paid' },
      { amount: 250, status: 'paid' },
      { amount: 250, status: 'pending' },
      { amount: 250, status: 'pending' },
    ])
    expect(r.paidCount).toBe(2)
    expect(r.remainingCount).toBe(2)
    expect(r.paidAmount).toBe(500)
    expect(r.remainingAmount).toBe(500)
    expect(r.progress).toBe(0.5)
  })

  it('debtRemainingFromInstallments suma solo las no pagadas', () => {
    expect(
      debtRemainingFromInstallments([
        { amount: 250, status: 'paid' },
        { amount: 250, status: 'pending' },
        { amount: 250, status: 'overdue' },
        { amount: 250, status: 'cancelled' },
      ]),
    ).toBe(500)
  })

  it('computeCardDebt deriva saldo = apertura + cargos − pagos (no negativo)', () => {
    expect(
      computeCardDebt({ openingBalance: 100, charges: 600, payments: 200 }),
    ).toBe(500)
    // los pagos nunca dejan el saldo por debajo de 0
    expect(
      computeCardDebt({ openingBalance: 0, charges: 100, payments: 500 }),
    ).toBe(0)
  })
})

import {
  debtRemainingFromInstallments,
  computeCardDebt,
} from '../financial-calculations'

import {
  simulateCashPurchase,
  simulateCreditCardPurchase,
  calculateDaysUntilPayment,
  calculateCardCutoffImpact,
  rankPaymentOptions,
  calculatePurchaseRisk,
  recommendBestPaymentMethod,
} from '../financial-calculations'

describe('purchase simulator pure functions', () => {
  const acc = (overrides: Partial<AccountRow> = {}): AccountRow => ({
    id: overrides.id ?? 'a1',
    user_id: 'u1',
    name: overrides.name ?? 'Cuenta',
    type: 'bank',
    balance: overrides.balance ?? 1_000_000,
    institution: null,
    color: null,
    archived: overrides.archived ?? false,
    notes: null,
    created_at: '',
    updated_at: '',
  })

  it('simulateCashPurchase calcula saldo después y riesgo', () => {
    const ok = simulateCashPurchase({ amount: 200, availableBalance: 1000 })
    expect(ok.canAfford).toBe(true)
    expect(ok.balanceAfter).toBe(800)
    expect(ok.risk).toBe('low')

    const broke = simulateCashPurchase({ amount: 1200, availableBalance: 1000 })
    expect(broke.canAfford).toBe(false)
    expect(broke.risk).toBe('high')

    const tight = simulateCashPurchase({
      amount: 800,
      availableBalance: 1000,
      emergencyMinimum: 150,
      upcomingCommitted: 100,
    })
    // queda 200 >= committed(100) y >= emergency(150), pero < emergency+committed(250)
    expect(tight.risk).toBe('medium')
  })

  it('simulateCreditCardPurchase calcula cupo y utilización', () => {
    const r = simulateCreditCardPurchase({
      amount: 500_000,
      card: card({ credit_limit: 1_000_000, current_debt: 0 }),
      purchaseDate: new Date('2026-06-01T00:00:00'),
    })
    expect(r.canAfford).toBe(true)
    expect(r.availableAfter).toBe(500_000)
    expect(r.utilizationAfter).toBe(0.5)
    expect(r.cardId).toBe('c1')
  })

  it('calculateDaysUntilPayment y cutoff devuelven días positivos', () => {
    const c = card({ statement_day: 15, payment_due_day: 5 })
    const d = calculateDaysUntilPayment(c, new Date('2026-06-01T00:00:00'))
    expect(d).toBeGreaterThanOrEqual(0)
    const impact = calculateCardCutoffImpact(c, new Date('2026-06-01T00:00:00'))
    expect(impact.interestFreeDays).toBeGreaterThanOrEqual(0)
    expect(impact.statementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('calculatePurchaseRisk combina factores', () => {
    expect(calculatePurchaseRisk({ canAfford: false })).toBe('high')
    expect(
      calculatePurchaseRisk({ canAfford: true, conflictsWithUpcoming: true }),
    ).toBe('high')
    expect(
      calculatePurchaseRisk({ canAfford: true, utilizationAfter: 0.6 }),
    ).toBe('medium')
    expect(
      calculatePurchaseRisk({ canAfford: true, necessary: false }),
    ).toBe('medium')
    expect(calculatePurchaseRisk({ canAfford: true })).toBe('low')
  })

  it('rankPaymentOptions ordena de mejor a peor', () => {
    const ranked = rankPaymentOptions({
      amount: 500_000,
      totalAvailable: 2_000_000,
      accounts: [acc({ id: 'a1', balance: 2_000_000 })],
      cards: [card({ id: 'c1', credit_limit: 1_000_000, current_debt: 0 })],
      purchaseDate: new Date('2026-06-01T00:00:00'),
    })
    expect(ranked.length).toBeGreaterThan(0)
    // todas asequibles en este escenario
    expect(ranked.every((o) => o.canAfford)).toBe(true)
    // ordenado por score descendente
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })

  it('recommendBestPaymentMethod sugiere comprar o esperar', () => {
    const buy = recommendBestPaymentMethod({
      amount: 100_000,
      totalAvailable: 5_000_000,
      accounts: [acc({ balance: 5_000_000 })],
      cards: [],
      necessary: true,
    })
    expect(buy.verdict).toBe('buy')
    expect(buy.best?.canAfford).toBe(true)

    const cannot = recommendBestPaymentMethod({
      amount: 9_000_000,
      totalAvailable: 100,
      accounts: [acc({ balance: 100 })],
      cards: [],
    })
    expect(cannot.verdict).toBe('cannot')
    expect(cannot.risk).toBe('high')
  })
})

import {
  aggregateSpendingByCategory,
  calculateFinancialHealth,
  sumIncomeVsExpense,
} from '../financial-calculations'

describe('dashboard aggregations', () => {
  const cats = [
    { id: 'food', name: 'Alimentación', color: '#f97316', icon: 'utensils' },
    { id: 'transport', name: 'Transporte', color: '#0ea5e9', icon: 'car' },
  ]
  const txs = [
    { kind: 'expense', amount: 300, category_id: 'food', date: '2026-06-02' },
    { kind: 'expense', amount: 100, category_id: 'food', date: '2026-06-03' },
    { kind: 'expense', amount: 200, category_id: 'transport', date: '2026-06-04' },
    { kind: 'expense', amount: 50, category_id: null, date: '2026-06-05' },
    { kind: 'income', amount: 5000, category_id: null, date: '2026-06-01' },
  ]

  it('aggregateSpendingByCategory agrupa y ordena por monto', () => {
    const out = aggregateSpendingByCategory(txs, cats)
    expect(out[0]).toMatchObject({ categoryId: 'food', amount: 400, name: 'Alimentación' })
    expect(out[1]).toMatchObject({ categoryId: 'transport', amount: 200 })
    expect(out[2]).toMatchObject({ categoryId: null, name: 'Sin categoría', amount: 50 })
    // shares suman ~1
    const sumShare = out.reduce((a, c) => a + c.share, 0)
    expect(Math.abs(sumShare - 1)).toBeLessThan(0.01)
    // el income no cuenta como gasto
    expect(out.reduce((a, c) => a + c.amount, 0)).toBe(650)
  })

  it('aggregateSpendingByCategory respeta el rango de fechas', () => {
    const out = aggregateSpendingByCategory(txs, cats, { from: '2026-06-04', to: '2026-06-30' })
    expect(out.map((o) => o.categoryId).sort()).toEqual([null, 'transport'])
  })

  it('sumIncomeVsExpense separa ingresos y gastos', () => {
    const r = sumIncomeVsExpense(txs)
    expect(r.income).toBe(5000)
    expect(r.expense).toBe(650)
    expect(r.net).toBe(4350)
  })

  it('calculateFinancialHealth puntúa según deuda/utilización/ahorro', () => {
    const healthy = calculateFinancialHealth({
      totalAvailable: 10_000_000,
      totalDebt: 0,
      netWorth: 10_000_000,
      cards: [],
      periodIncome: 5_000_000,
      periodExpense: 3_000_000,
    })
    expect(healthy.score).toBeGreaterThanOrEqual(80)
    expect(healthy.label).toBe('excelente')
    expect(healthy.debtRatio).toBe(0)

    const fragile = calculateFinancialHealth({
      totalAvailable: 100_000,
      totalDebt: 5_000_000,
      netWorth: -4_900_000,
      cards: [{ credit_limit: 1_000_000, current_debt: 950_000, archived: false }],
      periodIncome: 1_000_000,
      periodExpense: 1_400_000, // gasta más de lo que gana
    })
    expect(fragile.score).toBeLessThan(40)
    expect(fragile.label).toBe('frágil')
    expect(fragile.savingsRate).toBeLessThan(0)
  })
})

describe('proyección: cesantías excluidas del saldo', () => {
  const baseSp = (type: string, amount: number) => ({
    id: `sp-${type}`,
    user_id: 'u1',
    income_source_id: 'inc1',
    period_start: '2027-01-31',
    period_end: '2027-01-31',
    expected_amount: amount,
    actual_amount: null,
    type,
    created_at: '',
    updated_at: '',
  })

  it('projectFutureBalance suma prima/intereses pero NO cesantías capital', () => {
    const events = projectFutureBalance({
      startBalance: 1_000_000,
      asOfDate: new Date('2027-01-01T00:00:00'),
      horizonDays: 60,
      recurring: [],
      installments: [],
      salaryPeriods: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        baseSp('cesantias', 1_800_000) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        baseSp('cesantias_interest', 216_000) as any,
      ],
      salaryPeriods2: undefined,
    } as Parameters<typeof projectFutureBalance>[0])
    const descs = events.map((e) => e.description)
    expect(descs).toContain('Intereses cesantías')
    expect(descs).not.toContain('Cesantías')
    // el saldo final solo subió por los intereses (216k), no por el capital (1.8M)
    const last = events[events.length - 1]
    expect(last.runningBalance).toBe(1_216_000)
  })
})
