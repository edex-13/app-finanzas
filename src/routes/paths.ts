export const paths = {
  // public
  login: '/login',
  register: '/register',

  // protected
  dashboard: '/',
  onboarding: '/onboarding',
  accounts: '/accounts',
  cards: '/credit-cards',
  debts: '/debts',
  income: '/income',
  transactions: '/transactions',
  projections: '/projections',
  simulator: '/simulator',
  settings: '/settings',
} as const

export type AppPath = (typeof paths)[keyof typeof paths]
