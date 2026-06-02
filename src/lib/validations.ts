import { z } from 'zod'

// Helpers
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
const optDateStr = dateStr.optional().or(z.literal('').transform(() => undefined))
const moneyNonNeg = z
  .number({ message: 'Ingresa un monto' })
  .nonnegative('Debe ser ≥ 0')
const intPositive = z
  .number({ message: 'Ingresa un número' })
  .int()
  .positive('Debe ser > 0')
const dayOfMonth = z.number().int().min(1).max(31)
const hex = z
  .string()
  .regex(/^#?[0-9a-fA-F]{3,8}$/, 'Color hex inválido')
  .optional()
  .or(z.literal('').transform(() => undefined))

// =============================================================
// Auth
// =============================================================
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    full_name: z.string().min(1, 'Ingresa tu nombre').max(80),
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'Mínimo 6 caracteres'),
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Las contraseñas no coinciden',
  })
export type RegisterInput = z.infer<typeof registerSchema>

// =============================================================
// Accounts
// =============================================================
export const accountSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(80),
  type: z.enum(['cash', 'bank', 'digital_wallet', 'other']),
  balance: moneyNonNeg,
  institution: z.string().max(80).optional().or(z.literal('').transform(() => undefined)),
  color: hex,
  notes: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
})
export type AccountInput = z.infer<typeof accountSchema>

// =============================================================
// Credit cards
// =============================================================
export const creditCardSchema = z
  .object({
    name: z.string().min(1, 'Nombre requerido').max(80),
    bank: z.string().max(80).optional().or(z.literal('').transform(() => undefined)),
    credit_limit: moneyNonNeg,
    current_debt: moneyNonNeg,
    statement_day: dayOfMonth,
    payment_due_day: dayOfMonth,
    color: hex,
    notes: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => v.current_debt <= v.credit_limit, {
    path: ['current_debt'],
    message: 'La deuda actual no puede superar el cupo',
  })
export type CreditCardInput = z.infer<typeof creditCardSchema>

// =============================================================
// Debts
// =============================================================
export const debtSchema = z
  .object({
    name: z.string().min(1, 'Nombre requerido').max(80),
    debt_type: z.enum(['loan', 'mortgage', 'credit_card', 'personal', 'other']),
    total_amount: moneyNonNeg,
    remaining_balance: moneyNonNeg,
    interest_rate: z.number().min(0).max(100),
    has_interest: z.boolean(),
    payment_frequency: z.enum(['weekly', 'biweekly', 'monthly', 'custom']),
    next_payment_date: optDateStr,
    total_installments: z.number().int().positive().optional(),
    remaining_installments: z.number().int().nonnegative().optional(),
    approx_installment_amount: moneyNonNeg,
    payment_method_account_id: z.string().uuid().optional().nullable(),
    payment_method_card_id: z.string().uuid().optional().nullable(),
    notes: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => v.remaining_balance <= v.total_amount, {
    path: ['remaining_balance'],
    message: 'El saldo pendiente no puede superar el valor total',
  })
export type DebtInput = z.infer<typeof debtSchema>

// =============================================================
// Income
// =============================================================
export const incomeSourceSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(80),
  monthly_amount: moneyNonNeg,
  start_date: dateStr,
  end_date: optDateStr,
  payment_type: z.enum(['monthly', 'biweekly']),
  is_primary_salary: z.boolean(),
  includes_legal_benefits: z.boolean(),
  notes: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
})
export type IncomeSourceInput = z.infer<typeof incomeSourceSchema>

// =============================================================
// Transactions
// =============================================================
export const transactionSchema = z.object({
  date: dateStr,
  amount: z
    .number({ message: 'Ingresa un monto' })
    .positive('Debe ser > 0'),
  kind: z.enum([
    'income',
    'expense',
    'debt_payment',
    'card_payment',
    'transfer',
  ]),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  credit_card_id: z.string().uuid().nullable().optional(),
  debt_id: z.string().uuid().nullable().optional(),
  debt_installment_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
})
export type TransactionInput = z.infer<typeof transactionSchema>

export const recurringTransactionSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(80),
  kind: z.enum([
    'income',
    'expense',
    'debt_payment',
    'card_payment',
    'transfer',
  ]),
  amount: z.number().positive('Debe ser > 0'),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  credit_card_id: z.string().uuid().nullable().optional(),
  debt_id: z.string().uuid().nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']),
  interval_count: intPositive,
  start_date: dateStr,
  end_date: optDateStr,
  next_occurrence_date: dateStr,
  active: z.boolean(),
  notes: z.string().max(500).optional().or(z.literal('').transform(() => undefined)),
})
export type RecurringTransactionInput = z.infer<typeof recurringTransactionSchema>

// =============================================================
// Categories
// =============================================================
export const categorySchema = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum([
    'income',
    'expense',
    'debt_payment',
    'card_payment',
    'transfer',
  ]),
  color: hex,
  icon: z.string().max(40).optional().or(z.literal('').transform(() => undefined)),
})
export type CategoryInput = z.infer<typeof categorySchema>

// =============================================================
// Simulator
// =============================================================
export const simulationSchema = z.object({
  input_amount: z.number().positive('Debe ser > 0'),
  simulation_date: dateStr,
  payment_option: z.enum(['cash', 'account', 'card']),
  selected_account_id: z.string().uuid().nullable().optional(),
  selected_card_id: z.string().uuid().nullable().optional(),
  note: z.string().max(200).optional().or(z.literal('').transform(() => undefined)),
})
export type SimulationInput = z.infer<typeof simulationSchema>

// =============================================================
// Settings
// =============================================================
export const settingsSchema = z.object({
  currency: z.string().min(3).max(3),
  locale: z.string().min(2).max(10),
  alert_days_before_payment: z.number().int().min(0).max(30),
  theme: z.enum(['light', 'dark', 'system']),
})
export type SettingsInput = z.infer<typeof settingsSchema>
