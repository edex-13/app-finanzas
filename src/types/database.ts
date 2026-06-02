// Tipos mínimos escritos a mano que reflejan el schema en supabase/migrations/.
// Si más adelante corres `supabase gen types typescript` puedes reemplazar este archivo.

export type AccountType = 'cash' | 'bank' | 'digital_wallet' | 'other'
export type DebtTypeEnum =
  | 'loan'
  | 'mortgage'
  | 'credit_card'
  | 'personal'
  | 'other'
export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom'
export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled'
export type IncomePaymentType = 'monthly' | 'biweekly'
export type SalaryPeriodType =
  | 'regular'
  | 'prima'
  | 'cesantias_interest'
  | 'bonus'
export type CategoryKind =
  | 'income'
  | 'expense'
  | 'debt_payment'
  | 'card_payment'
  | 'transfer'
export type TransactionKind = CategoryKind
export type RecurrenceFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
export type PurchasePaymentOption = 'cash' | 'account' | 'card'

export interface ProfileRow {
  id: string
  full_name: string | null
  currency: string
  locale: string
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface SettingsRow {
  id: string
  user_id: string
  currency: string
  locale: string
  alert_days_before_payment: number
  theme: string
  dashboard_widgets: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AccountRow {
  id: string
  user_id: string
  name: string
  type: AccountType
  balance: number
  institution: string | null
  color: string | null
  archived: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreditCardRow {
  id: string
  user_id: string
  name: string
  bank: string | null
  credit_limit: number
  current_debt: number
  statement_day: number
  payment_due_day: number
  color: string | null
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface DebtRow {
  id: string
  user_id: string
  name: string
  debt_type: DebtTypeEnum
  total_amount: number
  remaining_balance: number
  interest_rate: number
  has_interest: boolean
  payment_frequency: PaymentFrequency
  next_payment_date: string | null
  total_installments: number | null
  remaining_installments: number | null
  approx_installment_amount: number
  payment_method_account_id: string | null
  payment_method_card_id: string | null
  notes: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export interface DebtInstallmentRow {
  id: string
  user_id: string
  debt_id: string
  sequence: number
  due_date: string
  amount: number
  status: InstallmentStatus
  paid_transaction_id: string | null
  created_at: string
  updated_at: string
}

export interface IncomeSourceRow {
  id: string
  user_id: string
  name: string
  monthly_amount: number
  start_date: string
  end_date: string | null
  payment_type: IncomePaymentType
  is_primary_salary: boolean
  includes_legal_benefits: boolean
  archived: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SalaryPeriodRow {
  id: string
  user_id: string
  income_source_id: string
  period_start: string
  period_end: string
  expected_amount: number
  actual_amount: number | null
  type: SalaryPeriodType
  created_at: string
  updated_at: string
}

export interface CategoryRow {
  id: string
  user_id: string
  name: string
  kind: CategoryKind
  color: string | null
  icon: string | null
  is_system: boolean
  archived: boolean
  created_at: string
  updated_at: string
}

export interface RecurringTransactionRow {
  id: string
  user_id: string
  name: string
  kind: TransactionKind
  amount: number
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
  debt_id: string | null
  frequency: RecurrenceFrequency
  interval_count: number
  start_date: string
  end_date: string | null
  next_occurrence_date: string
  active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TransactionRow {
  id: string
  user_id: string
  date: string
  amount: number
  kind: TransactionKind
  category_id: string | null
  account_id: string | null
  credit_card_id: string | null
  debt_id: string | null
  debt_installment_id: string | null
  recurrence_id: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseSimulationRow {
  id: string
  user_id: string
  input_amount: number
  simulation_date: string
  payment_option: PurchasePaymentOption
  selected_account_id: string | null
  selected_card_id: string | null
  suggested_card_id: string | null
  can_afford: boolean
  impact_json: Record<string, unknown>
  note: string | null
  created_at: string
}

export type InsertOf<T extends { id: string; created_at: string; updated_at?: string }> = Omit<
  T,
  'id' | 'created_at' | 'updated_at'
>
