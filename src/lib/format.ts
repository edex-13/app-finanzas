import { env } from './env'

const currencyFormatter = new Intl.NumberFormat(env.defaultLocale, {
  style: 'currency',
  currency: env.defaultCurrency,
  maximumFractionDigits: 0,
})

const compactCurrencyFormatter = new Intl.NumberFormat(env.defaultLocale, {
  style: 'currency',
  currency: env.defaultCurrency,
  notation: 'compact',
  maximumFractionDigits: 1,
})

const numberFormatter = new Intl.NumberFormat(env.defaultLocale, {
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat(env.defaultLocale, {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return currencyFormatter.format(value)
}

export function formatMoneyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return compactCurrencyFormatter.format(value)
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return numberFormatter.format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return percentFormatter.format(value)
}

// Parse "1.234.567" o "1234567" o "1.234.567,50" → 1234567.5
export function parseMoneyInput(raw: string): number {
  if (!raw) return 0
  const cleaned = raw
    .replace(/[^0-9,.\-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
