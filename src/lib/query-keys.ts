export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  settings: (userId: string) => ['settings', userId] as const,
  accounts: (userId: string) => ['accounts', userId] as const,
  account: (userId: string, id: string) => ['accounts', userId, id] as const,
  cards: (userId: string) => ['credit_cards', userId] as const,
  card: (userId: string, id: string) =>
    ['credit_cards', userId, id] as const,
  debts: (userId: string) => ['debts', userId] as const,
  debt: (userId: string, id: string) => ['debts', userId, id] as const,
  installments: (userId: string) => ['debt_installments', userId] as const,
  installmentsByDebt: (userId: string, debtId: string) =>
    ['debt_installments', userId, debtId] as const,
  income: (userId: string) => ['income_sources', userId] as const,
  salaryHistory: (userId: string) => ['salary_history', userId] as const,
  salaryPeriods: (userId: string) => ['salary_periods', userId] as const,
  categories: (userId: string) => ['categories', userId] as const,
  recurring: (userId: string) => ['recurring_transactions', userId] as const,
  transactions: (userId: string, filters?: unknown) =>
    filters
      ? (['transactions', userId, filters] as const)
      : (['transactions', userId] as const),
  simulations: (userId: string) =>
    ['purchase_simulations', userId] as const,
}
