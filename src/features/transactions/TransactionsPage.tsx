import { useMemo, useState } from 'react'
import { Plus, Receipt, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { PageHeader } from '@/components/layout/PageHeader'
import { TransactionForm } from './TransactionForm'
import { RecurringForm } from './RecurringForm'
import {
  useCategories,
  useCreateRecurring,
  useCreateTransaction,
  useDeleteRecurring,
  useDeleteTransaction,
  useMaterializeRecurring,
  useRecurringTransactions,
  useTransactions,
  type TransactionFilters,
} from './hooks'
import { formatDateShort } from '@/lib/date-utils'
import type { TransactionKind } from '@/types/database'

const kindLabel: Record<TransactionKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  debt_payment: 'Pago deuda',
  card_payment: 'Pago tarjeta',
  transfer: 'Transfer.',
}

const kindBadgeVariant: Record<
  TransactionKind,
  'success' | 'destructive' | 'warning' | 'secondary' | 'default'
> = {
  income: 'success',
  expense: 'destructive',
  debt_payment: 'warning',
  card_payment: 'warning',
  transfer: 'secondary',
}

export function TransactionsPage() {
  const [filters, setFilters] = useState<TransactionFilters>({})
  const [openNewTx, setOpenNewTx] = useState(false)
  const [openNewRec, setOpenNewRec] = useState(false)

  const { data: txs, isLoading } = useTransactions(filters)
  const { data: categories = [] } = useCategories()
  const { data: recurring } = useRecurringTransactions()
  const createTx = useCreateTransaction()
  const delTx = useDeleteTransaction()
  const createRec = useCreateRecurring()
  const delRec = useDeleteRecurring()
  const materialize = useMaterializeRecurring()

  const totals = useMemo(() => {
    if (!txs) return { income: 0, expense: 0 }
    return txs.reduce(
      (acc, t) => {
        if (t.kind === 'income') acc.income += Number(t.amount)
        else if (t.kind === 'expense') acc.expense += Number(t.amount)
        return acc
      },
      { income: 0, expense: 0 },
    )
  }, [txs])

  return (
    <div>
      <PageHeader
        title="Transacciones"
        description="Tus movimientos puntuales y plantillas recurrentes."
        action={
          <>
            <Dialog open={openNewRec} onOpenChange={setOpenNewRec}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Repeat className="mr-2 h-4 w-4" />
                  Recurrente
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Nueva transacción recurrente</DialogTitle>
                </DialogHeader>
                <RecurringForm
                  onCancel={() => setOpenNewRec(false)}
                  onSubmit={async (values) => {
                    await createRec.mutateAsync(values)
                    toast.success('Recurrente creada')
                    setOpenNewRec(false)
                  }}
                />
              </DialogContent>
            </Dialog>
            <Dialog open={openNewTx} onOpenChange={setOpenNewTx}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Nueva transacción</DialogTitle>
                </DialogHeader>
                <TransactionForm
                  onCancel={() => setOpenNewTx(false)}
                  onSubmit={async (values) => {
                    await createTx.mutateAsync(values)
                    toast.success('Transacción registrada')
                    setOpenNewTx(false)
                  }}
                />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Movimientos</TabsTrigger>
          <TabsTrigger value="recurring">Recurrentes</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Desde</p>
                <Input
                  type="date"
                  value={filters.from ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, from: e.target.value || undefined }))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hasta</p>
                <Input
                  type="date"
                  value={filters.to ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, to: e.target.value || undefined }))
                  }
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tipo</p>
                <Select
                  value={filters.kind ?? '__all'}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      kind: v === '__all' ? undefined : (v as TransactionKind),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todos</SelectItem>
                    {(Object.keys(kindLabel) as TransactionKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {kindLabel[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categoría</p>
                <Select
                  value={filters.categoryId ?? '__all'}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      categoryId: v === '__all' ? undefined : v,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Todas</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <p className="text-sm text-muted-foreground">Total ingresos</p>
                <MoneyDisplay
                  value={totals.income}
                  className="text-lg font-semibold"
                  positiveClass="text-success"
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <p className="text-sm text-muted-foreground">Total gastos</p>
                <MoneyDisplay
                  value={totals.expense}
                  className="text-lg font-semibold"
                />
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !txs || txs.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title="Sin movimientos"
              description="Cuando registres ingresos o gastos los verás aquí."
              action={
                <Button onClick={() => setOpenNewTx(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva transacción
                </Button>
              }
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        {formatDateShort(t.date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={kindBadgeVariant[t.kind]}>
                          {kindLabel[t.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay
                          value={Number(t.amount)}
                          positiveClass={
                            t.kind === 'income' ? 'text-success' : undefined
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm('¿Eliminar transacción?')) return
                            await delTx.mutateAsync(t.id)
                            toast.success('Eliminada')
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          {!recurring || recurring.length === 0 ? (
            <EmptyState
              icon={<Repeat className="h-8 w-8" />}
              title="Sin recurrentes"
              description="Plantillas como arriendo o suscripciones."
              action={
                <Button onClick={() => setOpenNewRec(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Crear recurrente
                </Button>
              }
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Frecuencia</TableHead>
                    <TableHead>Próxima</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-40 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurring.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Badge variant={kindBadgeVariant[r.kind]}>
                          {kindLabel[r.kind]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">
                        {r.frequency}
                        {r.interval_count > 1 ? ` × ${r.interval_count}` : ''}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateShort(r.next_occurrence_date)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MoneyDisplay value={Number(r.amount)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          onClick={async () => {
                            await materialize.mutateAsync(r)
                            toast.success('Ocurrencia registrada')
                          }}
                        >
                          Confirmar
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={async () => {
                            if (!confirm(`¿Eliminar "${r.name}"?`)) return
                            await delRec.mutateAsync(r.id)
                            toast.success('Eliminada')
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
