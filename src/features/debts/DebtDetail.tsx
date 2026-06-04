import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import {
  useInstallmentsByDebt,
  useMarkOverdueInstallments,
  usePayInstallment,
} from './hooks'
import { useAccounts } from '@/features/accounts/hooks'
import { recalculateDebtProgress } from '@/lib/financial-calculations'
import { formatDateShort } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import type { DebtRow, InstallmentStatus } from '@/types/database'

const statusLabel: Record<InstallmentStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
}

/* Mapeo de estado → variante (conservado; el restyle usa `statusChip`). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const statusVariant: Record<
  InstallmentStatus,
  'success' | 'warning' | 'destructive' | 'secondary'
> = {
  pending: 'secondary',
  paid: 'success',
  overdue: 'destructive',
  cancelled: 'secondary',
}

/* Chip de estado en tono pastel apagado (coral solo para vencida = alerta). */
const statusChip: Record<InstallmentStatus, string> = {
  pending: 'bg-pastel-sand/20 text-pastel-sand',
  paid: 'bg-success/15 text-success',
  overdue: 'bg-destructive/15 text-destructive',
  cancelled: 'bg-secondary text-muted-foreground',
}

export function DebtDetail({ debt }: { debt: DebtRow }) {
  const { data: installments, isLoading } = useInstallmentsByDebt(debt.id)
  const { data: accounts = [] } = useAccounts()
  const pay = usePayInstallment()
  const markOverdue = useMarkOverdueInstallments()
  const [accountId, setAccountId] = useState<string | null>(null)

  // Al abrir el detalle, persiste cuotas vencidas (best-effort).
  useEffect(() => {
    markOverdue.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const progress = useMemo(
    () => recalculateDebtProgress(Number(debt.total_amount), installments ?? []),
    [debt.total_amount, installments],
  )

  const nextDue = useMemo(
    () =>
      (installments ?? [])
        .filter((i) => i.status === 'pending' || i.status === 'overdue')
        .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0] ?? null,
    [installments],
  )

  const overdueCount = (installments ?? []).filter(
    (i) => i.status === 'overdue',
  ).length

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-3xl" />
  }

  if (!installments || installments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta deuda no tiene cuotas generadas. Edítala para definir número de
        cuotas, valor y próxima fecha de pago.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Resumen de progreso */}
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">
              Cuotas pagadas
            </p>
            <p className="text-3xl font-extrabold tracking-tight tnum">
              {progress.paidCount}
              <span className="text-xl text-muted-foreground">
                /{installments.length}
              </span>
            </p>
          </div>
          <span className="text-3xl font-extrabold tracking-tight tnum">
            {Math.round(progress.progress * 100)}%
          </span>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${progress.progress * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Restante{' '}
            <MoneyDisplay
              value={progress.remainingAmount}
              className="font-bold text-foreground"
            />
          </span>
          {nextDue && (
            <span className="text-muted-foreground">
              Próxima {formatDateShort(nextDue.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Aviso de cuotas vencidas (alerta = coral) */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {overdueCount} cuota{overdueCount > 1 ? 's' : ''} vencida
          {overdueCount > 1 ? 's' : ''}.
        </div>
      )}

      {/* Cuenta para pagar */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground">
          Pagar desde la cuenta
        </p>
        <Select
          value={accountId ?? '__none'}
          onValueChange={(v) => setAccountId(v === '__none' ? null : v)}
        >
          <SelectTrigger className="h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0">
            <SelectValue placeholder="Sin cuenta (solo marca pagada)" />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            <SelectItem value="__none">Sin cuenta</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de cuotas */}
      <MotionList className="space-y-2.5">
        {installments.map((inst) => {
          const payable =
            inst.status !== 'paid' && inst.status !== 'cancelled'
          return (
            <MotionItem key={inst.id}>
              <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">Cuota {inst.sequence}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {formatDateShort(inst.due_date)}
                    {inst.paid_at
                      ? ` · Pagada ${formatDateShort(inst.paid_at)}`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <MoneyDisplay
                    value={Number(inst.amount)}
                    className="text-sm font-extrabold tnum"
                  />
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                      statusChip[inst.status],
                    )}
                  >
                    {statusLabel[inst.status]}
                  </span>
                </div>

                {payable && (
                  <Button
                    size="sm"
                    className="h-9 shrink-0 px-4"
                    onClick={async () => {
                      try {
                        await pay.mutateAsync({
                          installmentId: inst.id,
                          accountId,
                        })
                        toast.success('Cuota pagada')
                      } catch (e) {
                        toast.error((e as Error).message ?? 'Error al pagar')
                      }
                    }}
                  >
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    Pagar
                  </Button>
                )}
              </div>
            </MotionItem>
          )
        })}
      </MotionList>
    </div>
  )
}
