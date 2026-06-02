import { useState } from 'react'
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { IncomeForm } from './IncomeForm'
import {
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeSources,
  useUpdateIncomeSource,
} from './hooks'
import type { IncomeSourceRow } from '@/types/database'

export function IncomePage() {
  const { data, isLoading } = useIncomeSources()
  const create = useCreateIncomeSource()
  const update = useUpdateIncomeSource()
  const del = useDeleteIncomeSource()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<IncomeSourceRow | null>(null)

  return (
    <div>
      <PageHeader
        title="Ingresos"
        description="Salario y otras fuentes recurrentes."
        action={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo ingreso
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Nuevo ingreso</DialogTitle>
              </DialogHeader>
              <IncomeForm
                onCancel={() => setOpenNew(false)}
                onSubmit={async (values) => {
                  await create.mutateAsync(values)
                  toast.success('Ingreso registrado')
                  setOpenNew(false)
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" />}
          title="Aún no registras ingresos"
          description="Registrar tu salario nos permite proyectar tu flujo."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear ingreso
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.map((i) => (
            <Card key={i.id}>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.payment_type === 'biweekly' ? 'Quincenal' : 'Mensual'}
                      {i.includes_legal_benefits ? ' · prestaciones legales' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(i)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${i.name}"?`)) return
                        await del.mutateAsync(i.id)
                        toast.success('Ingreso eliminado')
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <MoneyDisplay
                  value={Number(i.monthly_amount)}
                  className="text-2xl font-semibold"
                />
                <p className="text-xs text-muted-foreground">/ mes</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar ingreso</DialogTitle>
          </DialogHeader>
          {editing && (
            <IncomeForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, input: values })
                toast.success('Actualizado')
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
