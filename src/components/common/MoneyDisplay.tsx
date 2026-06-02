import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'

interface Props {
  value: number | null | undefined
  className?: string
  positiveClass?: string
  negativeClass?: string
  showSign?: boolean
}

export function MoneyDisplay({
  value,
  className,
  positiveClass,
  negativeClass,
  showSign = false,
}: Props) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn('tnum text-muted-foreground', className)}>—</span>
  }
  const isNeg = value < 0
  const sign = showSign && value > 0 ? '+' : ''
  return (
    <span
      className={cn(
        'tnum',
        isNeg ? (negativeClass ?? 'text-destructive') : positiveClass,
        className,
      )}
    >
      {sign}
      {formatMoney(value)}
    </span>
  )
}
