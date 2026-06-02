import { useState } from 'react'
import { Plus, Wallet, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { PageHeader } from '@/components/layout/PageHeader'
import { AccountForm } from './AccountForm'
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from './hooks'
import type { AccountRow, AccountType } from '@/types/database'

const typeLabel: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Bancaria',
  digital_wallet: 'Billetera',
  other: 'Otra',
}

export function AccountsPage() {
  const { data, isLoading } = useAccounts()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const del = useDeleteAccount()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<AccountRow | null>(null)

  return (
    <div>
      <PageHeader
        title="Cuentas"
        description="Tu dinero líquido en efectivo, bancos y billeteras digitales."
        action={
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva cuenta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva cuenta</DialogTitle>
                <DialogDescription>
                  Una cuenta puede ser efectivo, banco, billetera u otro saldo.
                </DialogDescription>
              </DialogHeader>
              <AccountForm
                onCancel={() => setOpenNew(false)}
                onSubmit={async (values) => {
                  await create.mutateAsync(values)
                  toast.success('Cuenta creada')
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
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Aún no tienes cuentas"
          description="Agrega tu primera cuenta para empezar a llevar el control."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear cuenta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div
                className="h-1.5 w-full"
                style={{ background: a.color ?? 'hsl(var(--primary))' }}
              />
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.institution ?? '—'}
                    </p>
                  </div>
                  <Badge variant="secondary">{typeLabel[a.type]}</Badge>
                </div>
                <MoneyDisplay
                  value={Number(a.balance)}
                  className="text-2xl font-semibold"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing(a)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`¿Eliminar "${a.name}"?`)) return
                      await del.mutateAsync(a.id)
                      toast.success('Cuenta eliminada')
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar cuenta</DialogTitle>
          </DialogHeader>
          {editing && (
            <AccountForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, input: values })
                toast.success('Cuenta actualizada')
                setEditing(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
