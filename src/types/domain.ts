import type {
  AccountRow,
  CreditCardRow,
  DebtInstallmentRow,
  DebtRow,
  RecurringTransactionRow,
  SalaryPeriodRow,
  TransactionKind,
} from './database'

export interface FinancialSnapshot {
  totalAvailable: number
  totalDebt: number
  cardDebt: number
  loanDebt: number
  liquidNetWorth: number
  totalCreditAvailable: number
}

export interface ProjectedEvent {
  date: string
  kind: TransactionKind | 'salary'
  amount: number
  signedAmount: number
  source: string
  sourceId?: string
  description: string
  runningBalance: number
}

export type UpcomingPaymentType = 'installment' | 'card' | 'recurring'
export type UpcomingPaymentStatus = 'overdue' | 'today' | 'soon' | 'scheduled'

export interface UpcomingPayment {
  date: string
  label: string
  amount: number
  type: UpcomingPaymentType
  /** Días desde hoy (negativo = vencido). */
  daysUntil: number
  status: UpcomingPaymentStatus
  sourceId?: string
}

export interface UpcomingIncome {
  date: string
  label: string
  amount: number
  daysUntil: number
}

export interface PurchaseRecommendation {
  cardId: string | null
  card?: CreditCardRow
  daysOfFloat: number
  reason: string
  newAvailableLimit?: number
  utilizationAfter?: number
}

export interface ProjectionInput {
  startBalance: number
  asOfDate: Date
  horizonDays: number
  recurring: RecurringTransactionRow[]
  installments: DebtInstallmentRow[]
  salaryPeriods: SalaryPeriodRow[]
  scheduledOneOffs?: Array<{
    date: string
    amount: number
    kind: TransactionKind
    description: string
    sourceId?: string
  }>
}

export interface AccountWithUsage extends AccountRow {
  // reservado para futuros agregados
}

export interface CardWithDerived extends CreditCardRow {
  availableLimit: number
  utilization: number
  nextStatementDate: Date
  nextPaymentDueDate: Date
}

export interface DebtWithDerived extends DebtRow {
  installmentsToCome: DebtInstallmentRow[]
  progress: number
}
