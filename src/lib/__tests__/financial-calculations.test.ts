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
