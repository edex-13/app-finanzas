import { useState } from 'react'
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { PageHeader } from '@/components/layout/PageHeader'
import { CreditCardForm } from './CreditCardForm'
import {
  useCreateCard,
  useCreditCards,
  useDeleteCard,
  useUpdateCard,
} from './hooks'
import {
  calculateAvailableCardLimit,
  nextPaymentDueDate,
  nextStatementDate,
} from '@/lib/financial-calculations'
import { formatDateShort } from '@/lib/date-utils'
import { formatPercent } from '@/lib/format'
import type { CreditCardRow } from '@/types/database'

export function CreditCardsPage() {
  const { data, isLoading } = useCreditCards()
  const create = useCreateCard()
  const update = useUpdateCard()
  const del = useDeleteCard()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<CreditCardRow | null>(null)

  return (
    <div>
      <PageHeader
        title="Tarjetas de crédito"
        description="Tus cupos, deudas, fechas de corte y pago."
        action={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva tarjeta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva tarjeta de crédito</DialogTitle>
              </DialogHeader>
              <CreditCardForm
                onCancel={() => setOpenNew(false)}
                onSubmit={async (values) => {
                  await create.mutateAsync(values)
                  toast.success('Tarjeta creada')
                  setOpenNew(false)
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="Aún no tienes tarjetas"
          description="Registra tus tarjetas para ver cupos, fechas de corte y pago."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear tarjeta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const available = calculateAvailableCardLimit(c)
            const util =
              c.credit_limit > 0 ? c.current_debt / c.credit_limit : 0
            return (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="h-16 w-full"
                  style={{
                    background:
                      c.color ??
                      'linear-gradient(135deg,#1e293b,#334155)',
                  }}
                />
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.bank ?? '—'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      Corte día <span className="text-foreground font-medium">{c.statement_day}</span>
                      <br />
                      Pago día{' '}
                      <span className="text-foreground font-medium">
                        {c.payment_due_day}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Cupo disponible
                      </p>
                      <MoneyDisplay
                        value={available}
                        className="font-semibold"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Deuda actual
                      </p>
                      <MoneyDisplay
                        value={Number(c.current_debt)}
                        className="font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Utilización</span>
                      <span>{formatPercent(util)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, util * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Próx. corte: {formatDateShort(nextStatementDate(c))}
                    </span>
                    <span>
                      Próx. pago: {formatDateShort(nextPaymentDueDate(c))}
                    </span>
                  </div>

                  <div className="flex justify-end gap-1 pt-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(c)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${c.name}"?`)) return
                        await del.mutateAsync(c.id)
                        toast.success('Tarjeta eliminada')
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tarjeta</DialogTitle>
          </DialogHeader>
          {editing && (
            <CreditCardForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, input: values })
                toast.success('Tarjeta actualizada')
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
