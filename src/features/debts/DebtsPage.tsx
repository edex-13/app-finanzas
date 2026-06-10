import { useState } from 'react'
import { ListChecks, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { DebtForm } from './DebtForm'
import { DebtDetail } from './DebtDetail'
import {
  useCreateDebt,
  useDebtInstallments,
  useDebts,
  useDeleteDebt,
  useUpdateDebt,
} from './hooks'
import { recalculateDebtProgress } from '@/lib/financial-calculations'
import { formatDateShort } from '@/lib/date-utils'
import type { DebtInstallmentRow, DebtRow } from '@/types/database'

const typeLabel: Record<DebtRow['debt_type'], string> = {
  loan: 'Préstamo',
  mortgage: 'Hipoteca',
  credit_card: 'Tarjeta',
  personal: 'Personal',
  other: 'Otra',
}

const freqLabel = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  custom: 'Otra',
} as const

export function DebtsPage() {
  const { data, isLoading } = useDebts()
  const { data: allInstallments } = useDebtInstallments()
  const create = useCreateDebt()
  const update = useUpdateDebt()
  const del = useDeleteDebt()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<DebtRow | null>(null)
  const [detail, setDetail] = useState<DebtRow | null>(null)

  return (
    <div>
      <PageHeader
        title="Deudas"
        description="Lleva el control de tus préstamos, cuotas e intereses."
        action={
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva deuda
          </Button>
        }
      />

      <ResponsiveModal
        open={openNew}
        onOpenChange={setOpenNew}
        title="Nueva deuda"
        className="sm:max-w-2xl"
      >
        <DebtForm
          onCancel={() => setOpenNew(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            toast.success('Deuda creada')
            setOpenNew(false)
          }}
        />
      </ResponsiveModal>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="Aún no tienes deudas"
          description="Si tienes algún crédito, regístralo aquí para proyectar tus cuotas."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear deuda
            </Button>
          }
        />
      ) : (
        <MotionList className="grid gap-3 sm:grid-cols-2">
          {data.map((d) => {
            // Las cuotas son la fuente de verdad del avance (consistente con el
            // detalle). Si la deuda no tiene cuotas generadas, caemos al saldo.
            const debtInstallments = (allInstallments ?? []).filter(
              (i: DebtInstallmentRow) => i.debt_id === d.id,
            )
            const hasInstallments = debtInstallments.length > 0
            const prog = recalculateDebtProgress(
              Number(d.total_amount),
              debtInstallments,
            )
            const progress = hasInstallments
              ? prog.progress
              : d.total_amount > 0
                ? Math.min(
                    1,
                    Math.max(0, 1 - d.remaining_balance / d.total_amount),
                  )
                : 0
            const remainingBalance = hasInstallments
              ? prog.remainingAmount
              : Number(d.remaining_balance)
            const remainingLabel = hasInstallments
              ? `${prog.paidCount}/${debtInstallments.length} cuotas`
              : `${d.remaining_installments ?? '?'} cuotas restantes`
            return (
              <MotionItem key={d.id}>
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel[d.debt_type]} · {freqLabel[d.payment_frequency]}
                      </p>
                    </div>
                    <Badge variant={d.has_interest ? 'warning' : 'secondary'}>
                      {d.has_interest
                        ? `${d.interest_rate}%`
                        : 'Sin intereses'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Saldo pendiente
                      </p>
                      <MoneyDisplay
                        value={remainingBalance}
                        className="font-semibold"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Cuota aprox.
                      </p>
                      <MoneyDisplay
                        value={Number(d.approx_installment_amount)}
                        className="font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Avance</span>
                      <span>{remainingLabel}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-success"
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                  </div>

                  {d.next_payment_date && (
                    <p className="text-xs text-muted-foreground">
                      Próximo pago: {formatDateShort(d.next_payment_date)}
                    </p>
                  )}

                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="pill"
                      className="mr-auto font-bold"
                      onClick={() => setDetail(d)}
                    >
                      <Receipt className="mr-1 h-4 w-4" />
                      Ver cuotas
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(d)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${d.name}"?`)) return
                        await del.mutateAsync(d.id)
                        toast.success('Deuda eliminada')
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              </MotionItem>
            )
          })}
        </MotionList>
      )}

      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar deuda"
        className="sm:max-w-2xl"
      >
        {editing && (
          <DebtForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: editing.id, input: values })
              toast.success('Deuda actualizada')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>

      <ResponsiveModal
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail ? `${detail.name} · Cuotas` : 'Cuotas'}
      >
        {detail && <DebtDetail debt={detail} />}
      </ResponsiveModal>
    </div>
  )
}
