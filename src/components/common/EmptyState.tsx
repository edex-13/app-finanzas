import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
          {icon}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-base font-semibold">{title}</p>
        {description && (
          <p className="mx-auto max-w-xs text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
