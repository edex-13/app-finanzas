import { createElement, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Scale,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { SwipeRow } from '@/components/common/SwipeRow'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { categoryColor, categoryIcon, categoryTint } from '@/lib/category-visual'
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
  useTransactionFilters,
  useUpdateTransaction,
} from './hooks'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { formatDateShort, today, toISODate } from '@/lib/date-utils'
import { formatMoneyCompact } from '@/lib/format'
import {
  aggregateSpendingByCategory,
  calculateTransactionImpact,
} from '@/lib/financial-calculations'
import type {
  CategoryRow,
  TransactionKind,
  TransactionRow,
} from '@/types/database'

const kindLabel: Record<TransactionKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  debt_payment: 'Pago deuda',
  card_payment: 'Pago tarjeta',
  transfer: 'Transfer.',
  adjustment: 'Ajuste',
}

// Icono lucide por tipo: iconografía limpia (sin emoji) para el avatar de cada
// fila cuando la transacción no tiene categoría propia.
const kindIcon: Record<TransactionKind, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  debt_payment: Landmark,
  card_payment: CreditCard,
  transfer: ArrowLeftRight,
  adjustment: Scale,
}

// Pastel apagado de fondo del avatar según el tipo de movimiento.
const kindAvatarClass: Record<TransactionKind, string> = {
  income: 'bg-pastel-mint',
  expense: 'bg-pastel-terracotta',
  debt_payment: 'bg-pastel-mustard',
  card_payment: 'bg-pastel-blue',
  transfer: 'bg-pastel-lavender',
  adjustment: 'bg-pastel-sand',
}

// Estilo de chip-tipo (texto oscuro sobre pastel apagado, como las categorías de MonAi).
const kindChipClass: Record<TransactionKind, string> = {
  income: 'bg-pastel-mint text-black/70',
  expense: 'bg-pastel-terracotta text-black/70',
  debt_payment: 'bg-pastel-mustard text-black/70',
  card_payment: 'bg-pastel-blue text-black/70',
  transfer: 'bg-pastel-lavender text-black/70',
  adjustment: 'bg-pastel-sand text-black/70',
}

// Trigger de Select estilizado como píldora suave (sin caja con borde duro).
const pillTrigger =
  'h-11 rounded-2xl border-0 bg-secondary px-4 text-sm font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0'

// Input estilizado como píldora suave.
const pillInput =
  'h-11 rounded-2xl border-0 bg-secondary px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

export function TransactionsPage() {
  const { filters, setFilter } = useTransactionFilters()
  const [openNewTx, setOpenNewTx] = useState(false)
  const [openNewRec, setOpenNewRec] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  // Panel de filtros avanzados (cuenta/tarjeta/búsqueda): oculto por defecto.
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Inputs de fecha personalizados (atajo "Elegir…"): revelados bajo demanda.
  const [showDatePicker, setShowDatePicker] = useState(false)

  const { data: txs, isLoading } = useTransactions(filters)
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: cards = [] } = useCreditCards()
  const { data: recurring } = useRecurringTransactions()
  const createTx = useCreateTransaction()
  const updateTx = useUpdateTransaction()
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

  // Lookup por id para cruzar cada transacción con su categoría real
  // (color + icono propios) sin recorrer el array en cada fila.
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  // Categoría sobre las MISMAS transacciones visibles: alimenta la gráfica de
  // barras (top 6) que también actúa como selector de categoría. Se adapta al
  // flujo activo: si miras Ingresos agrega ingresos; si no, gastos/egresos.
  const spendKinds = useMemo(
    () =>
      filters.flow === 'in'
        ? ['income']
        : ['expense', 'debt_payment', 'card_payment'],
    [filters.flow],
  )
  const spending = useMemo(
    () =>
      aggregateSpendingByCategory(txs ?? [], categories, {
        limit: 12,
        kinds: spendKinds,
      }),
    [txs, categories, spendKinds],
  )
  const spendTitle = filters.flow === 'in' ? 'De dónde viene' : 'En qué gastas'
  const spendMax = useMemo(
    () => spending.reduce((m, s) => Math.max(m, s.amount), 0),
    [spending],
  )

  // Atajos de fecha: comparamos contra el rango actual para resaltar el chip.
  // Semana con lunes como primer día (es-CO); mes calendario completo.
  const isoToday = toISODate(today())
  const isoWeekStart = toISODate(startOfWeek(today(), { weekStartsOn: 1 }))
  const isoWeekEnd = toISODate(endOfWeek(today(), { weekStartsOn: 1 }))
  const isoMonthStart = toISODate(startOfMonth(today()))
  const isoMonthEnd = toISODate(endOfMonth(today()))
  const dateShortcut =
    filters.from === isoToday && filters.to === isoToday
      ? 'today'
      : filters.from === isoWeekStart && filters.to === isoWeekEnd
        ? 'week'
        : filters.from === isoMonthStart && filters.to === isoMonthEnd
          ? 'month'
          : filters.from || filters.to
            ? 'custom'
            : 'all'

  const setDateRange = (from?: string, to?: string) => {
    setFilter('from', from)
    setFilter('to', to)
  }

  return (
    <div>
      <PageHeader
        title="Transacciones"
        description="Tus movimientos puntuales y plantillas recurrentes."
        action={
          <>
            <Button variant="secondary" onClick={() => setOpenNewRec(true)}>
              <Repeat className="mr-2 h-4 w-4" />
              Recurrente
            </Button>
            <Button onClick={() => setOpenNewTx(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva
            </Button>
          </>
        }
      />

      <ResponsiveModal
        open={openNewRec}
        onOpenChange={setOpenNewRec}
        title="Movimiento recurrente"
        className="sm:max-w-xl"
      >
        <RecurringForm
          onCancel={() => setOpenNewRec(false)}
          onSubmit={async (values) => {
            await createRec.mutateAsync(values)
            toast.success('Recurrente creada')
            setOpenNewRec(false)
          }}
        />
      </ResponsiveModal>

      <ResponsiveModal
        open={openNewTx}
        onOpenChange={setOpenNewTx}
        title="Registrar movimiento"
        className="sm:max-w-xl"
      >
        <TransactionForm
          onCancel={() => setOpenNewTx(false)}
          onSubmit={async (values) => {
            await createTx.mutateAsync(values)
            toast.success('Transacción registrada')
            setOpenNewTx(false)
          }}
        />
      </ResponsiveModal>

      <Tabs defaultValue="list">
        <TabsList className="h-11 rounded-full bg-secondary p-1">
          <TabsTrigger
            value="list"
            className="rounded-full px-5 py-1.5 font-bold data-[state=active]:bg-card"
          >
            Movimientos
          </TabsTrigger>
          <TabsTrigger
            value="recurring"
            className="rounded-full px-5 py-1.5 font-bold data-[state=active]:bg-card"
          >
            Recurrentes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6 py-2">
          {/* 1) Tipo: segmented-control de dos píldoras grandes con icono.
              Activo en morado sólido, inactivo en bg-secondary. */}
          <div className="space-y-2">
            <FilterLabel>Tipo</FilterLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <FlowChip
                label="Ingresos"
                icon={ArrowDownLeft}
                active={filters.flow === 'in'}
                onClick={() =>
                  setFilter('flow', filters.flow === 'in' ? undefined : 'in')
                }
              />
              <FlowChip
                label="Gastos"
                icon={ArrowUpRight}
                active={filters.flow === 'out'}
                onClick={() =>
                  setFilter('flow', filters.flow === 'out' ? undefined : 'out')
                }
              />
            </div>
          </div>

          {/* 2) Fecha: chips de atajo. "Elegir…" revela dos date pills. */}
          <div className="space-y-2.5">
            <FilterLabel>Fecha</FilterLabel>
            <div className="flex flex-wrap gap-2">
              <DateChip
                label="Todo"
                active={dateShortcut === 'all'}
                onClick={() => {
                  setShowDatePicker(false)
                  setDateRange(undefined, undefined)
                }}
              />
              <DateChip
                label="Hoy"
                active={dateShortcut === 'today'}
                onClick={() => {
                  setShowDatePicker(false)
                  setDateRange(isoToday, isoToday)
                }}
              />
              <DateChip
                label="Esta semana"
                active={dateShortcut === 'week'}
                onClick={() => {
                  setShowDatePicker(false)
                  setDateRange(isoWeekStart, isoWeekEnd)
                }}
              />
              <DateChip
                label="Este mes"
                active={dateShortcut === 'month'}
                onClick={() => {
                  setShowDatePicker(false)
                  setDateRange(isoMonthStart, isoMonthEnd)
                }}
              />
              <DateChip
                label="Elegir…"
                active={dateShortcut === 'custom' || showDatePicker}
                onClick={() => setShowDatePicker((v) => !v)}
              />
            </div>
            {showDatePicker && (
              <div className="grid grid-cols-2 gap-2.5">
                <Input
                  type="date"
                  aria-label="Desde"
                  value={filters.from ?? ''}
                  onChange={(e) => setFilter('from', e.target.value)}
                  className={pillInput}
                />
                <Input
                  type="date"
                  aria-label="Hasta"
                  value={filters.to ?? ''}
                  onChange={(e) => setFilter('to', e.target.value)}
                  className={pillInput}
                />
              </div>
            )}
          </div>

          {/* 3) Gasto por categoría: barras que también filtran al tocarlas.
              Se muestra SIEMPRE; si no hay gastos, estado vacío sutil. */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <FilterLabel>{spendTitle}</FilterLabel>
              {filters.categoryId && (
                <button
                  type="button"
                  onClick={() => setFilter('categoryId', undefined)}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-muted-foreground active:scale-[0.97]"
                >
                  <X className="h-3 w-3" />
                  Quitar
                </button>
              )}
            </div>
            {spending.length > 0 ? (
              <div className="nice-scroll -mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex items-end gap-3">
                  {spending.map((s) => (
                    <SpendBar
                      key={s.categoryId ?? '__none'}
                      spend={s}
                      max={spendMax}
                      active={filters.categoryId === s.categoryId}
                      dimmed={
                        !!filters.categoryId &&
                        filters.categoryId !== s.categoryId
                      }
                      onClick={() =>
                        s.categoryId &&
                        setFilter(
                          'categoryId',
                          filters.categoryId === s.categoryId
                            ? undefined
                            : s.categoryId,
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-card p-4 text-center text-xs font-semibold text-muted-foreground">
                {filters.flow === 'in'
                  ? 'Aún no hay ingresos en este periodo'
                  : 'Aún no hay gastos en este periodo'}
              </div>
            )}
          </div>

          {/* 4) Filtros avanzados (cuenta/tarjeta/búsqueda): colapsado tras un
              enlace discreto con chevron que rota al abrir. */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mx-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground active:scale-[0.97]"
            >
              Más filtros
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform',
                  showAdvanced && 'rotate-180',
                )}
              />
            </button>
            {showAdvanced && (
              <div className="space-y-2.5 rounded-3xl bg-card p-4">
                <div className="space-y-1.5">
                  <FilterLabel>Buscar</FilterLabel>
                  <Input
                    placeholder="Buscar descripción…"
                    value={filters.search ?? ''}
                    onChange={(e) => setFilter('search', e.target.value)}
                    className={pillInput}
                  />
                </div>
                {accounts.length > 0 && (
                  <ChipFilterRow
                    label="Cuenta"
                    options={accounts.map((a) => ({ id: a.id, name: a.name }))}
                    value={filters.accountId}
                    onChange={(v) => setFilter('accountId', v)}
                  />
                )}
                {cards.length > 0 && (
                  <ChipFilterRow
                    label="Tarjeta"
                    options={cards.map((c) => ({ id: c.id, name: c.name }))}
                    value={filters.cardId}
                    onChange={(v) => setFilter('cardId', v)}
                  />
                )}
              </div>
            )}
          </div>

          {/* Totales como números protagonistas, pastel. */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-3xl bg-card px-4 py-4">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Total ingresos
              </p>
              <MoneyDisplay
                value={totals.income}
                className="mt-1 block text-2xl font-extrabold tnum text-success"
              />
            </div>
            <div className="rounded-3xl bg-card px-4 py-4">
              <p className="text-[11px] font-semibold text-muted-foreground">
                Total gastos
              </p>
              <MoneyDisplay
                value={totals.expense}
                className="mt-1 block text-2xl font-extrabold tnum"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] w-full rounded-2xl" />
              ))}
            </div>
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
            <MotionList className="space-y-2.5">
              {txs.map((t) => {
                // Categoría real de la transacción (si la tiene): su color e
                // icono mandan sobre el avatar genérico por tipo.
                const cat = t.category_id
                  ? categoryById.get(t.category_id)
                  : undefined
                const CatIcon = cat ? categoryIcon(cat.icon) : null
                return (
                <MotionItem key={t.id}>
                  <SwipeRow
                    className="shadow-soft"
                    onEdit={() => setEditing(t)}
                    onDelete={async () => {
                      if (!confirm('¿Eliminar transacción?')) return
                      await delTx.mutateAsync(t.id)
                      toast.success('Eliminada')
                    }}
                  >
                  <div className="flex items-center gap-3 bg-card px-4 py-3">
                    {/* Avatar: icono + color reales de la categoría; si la
                        transacción no tiene categoría, fallback al pastel +
                        emoji por tipo (transferencias, ajustes…). */}
                    {cat && CatIcon ? (
                      <span
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                        style={categoryTint(cat.color)}
                      >
                        <CatIcon className="h-5 w-5" strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'grid h-11 w-11 shrink-0 place-items-center rounded-full text-black/70',
                          kindAvatarClass[t.kind],
                        )}
                      >
                        {createElement(kindIcon[t.kind], {
                          className: 'h-5 w-5',
                          strokeWidth: 2.5,
                        })}
                      </span>
                    )}

                    {/* Título + meta */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {t.note ?? cat?.name ?? kindLabel[t.kind]}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {/* Nombre de categoría real teñido con su color, o
                            chip por tipo como respaldo. */}
                        {cat ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={categoryTint(cat.color)}
                          >
                            {cat.name}
                          </span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
                              kindChipClass[t.kind],
                            )}
                          >
                            {kindLabel[t.kind]}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {formatDateShort(t.date)}
                        </span>
                      </div>
                    </div>

                    {/* Monto protagonista a la derecha */}
                    <MoneyDisplay
                      value={Number(t.amount)}
                      showSign={t.kind === 'income'}
                      className={cn(
                        'shrink-0 text-base font-extrabold tnum',
                        t.kind === 'income' && 'text-success',
                      )}
                    />

                    {/* Acciones contextuales: visibles en escritorio; en móvil
                        se usa el swipe. */}
                    <div className="hidden shrink-0 items-center sm:flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full text-muted-foreground"
                        onClick={() => setEditing(t)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-full text-muted-foreground"
                        onClick={async () => {
                          if (!confirm('¿Eliminar transacción?')) return
                          await delTx.mutateAsync(t.id)
                          toast.success('Eliminada')
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  </SwipeRow>
                </MotionItem>
                )
              })}
            </MotionList>
          )}
        </TabsContent>

        <TabsContent value="recurring" className="space-y-2.5">
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
            <MotionList className="space-y-2.5">
              {recurring.map((r) => (
                <MotionItem key={r.id}>
                  <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft">
                    <span
                      className={cn(
                        'grid h-11 w-11 shrink-0 place-items-center rounded-full text-black/70',
                        kindAvatarClass[r.kind],
                      )}
                    >
                      {createElement(kindIcon[r.kind], {
                        className: 'h-5 w-5',
                        strokeWidth: 2.5,
                      })}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{r.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold capitalize',
                            kindChipClass[r.kind],
                          )}
                        >
                          {r.frequency}
                          {r.interval_count > 1 ? ` × ${r.interval_count}` : ''}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          próx. {formatDateShort(r.next_occurrence_date)}
                        </span>
                      </div>
                    </div>

                    <MoneyDisplay
                      value={Number(r.amount)}
                      className="shrink-0 text-base font-extrabold tnum"
                    />

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
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
                        className="h-9 w-9 rounded-full text-muted-foreground"
                        onClick={async () => {
                          if (!confirm(`¿Eliminar "${r.name}"?`)) return
                          await delRec.mutateAsync(r.id)
                          toast.success('Eliminada')
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </MotionItem>
              ))}
            </MotionList>
          )}
        </TabsContent>
      </Tabs>

      {/* Edición: solo campos descriptivos (fecha, categoría, nota).
          Para cambiar montos o cuentas el flujo es borrar y recrear. */}
      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar movimiento"
        className="sm:max-w-md"
      >
        {editing && (
          <EditTransactionFields
            tx={editing}
            categories={categories}
            onCancel={() => setEditing(null)}
            onSave={async (patch) => {
              await updateTx.mutateAsync({ id: editing.id, patch })
              toast.success('Transacción actualizada')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>
    </div>
  )
}

// Mini-etiqueta de grupo de filtros (estilo MonAi): mayúsculas, gris, sutil.
function FilterLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

// Segmento grande de tipo (Ingresos / Gastos) con icono lucide: activo en
// morado sólido, inactivo en bg-secondary. Altura cómoda para el dedo.
function FlowChip({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold transition-colors active:scale-[0.97]',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-foreground',
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
      {label}
    </button>
  )
}

// Chip de atajo de fecha: activo en morado.
function DateChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm font-bold transition-colors active:scale-[0.97]',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-foreground',
      )}
    >
      {label}
    </button>
  )
}

// Barra VERTICAL de categoría. Altura proporcional al monto (vs el máximo),
// color real de la categoría. Tocarla filtra. Ancho fijo → scroll horizontal
// cuando hay muchas categorías.
const BAR_TRACK_H = 96 // px

function SpendBar({
  spend,
  max,
  active,
  dimmed,
  onClick,
}: {
  spend: import('@/lib/financial-calculations').CategorySpend
  max: number
  active: boolean
  dimmed: boolean
  onClick: () => void
}) {
  const color = categoryColor(spend.color)
  // Altura proporcional; mínimo visible para montos pequeños.
  const ratio = max > 0 ? spend.amount / max : 0
  const barH = Math.max(Math.round(ratio * BAR_TRACK_H), 8)
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${spend.name}: ${formatMoneyCompact(spend.amount)}`}
      className={cn(
        'flex w-[68px] shrink-0 flex-col items-center gap-2 rounded-2xl bg-card px-2 py-3 transition-opacity active:scale-[0.97]',
        dimmed && 'opacity-40',
        active && 'ring-2 ring-primary/60',
      )}
    >
      {/* Monto arriba */}
      <span className="text-[11px] font-extrabold tnum">
        {formatMoneyCompact(spend.amount)}
      </span>
      {/* Pista vertical con relleno que crece hacia arriba */}
      <div
        className="flex w-7 items-end overflow-hidden rounded-full bg-secondary"
        style={{ height: BAR_TRACK_H }}
      >
        <div
          className="w-full rounded-full transition-[height]"
          style={{ height: barH, backgroundColor: color }}
        />
      </div>
      {/* Avatar de categoría abajo */}
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={categoryTint(spend.color)}
      >
        {createElement(categoryIcon(spend.icon), {
          className: 'h-4 w-4',
          strokeWidth: 2.5,
        })}
      </span>
      <span className="w-full truncate text-center text-[10px] font-bold text-muted-foreground">
        {spend.name}
      </span>
    </button>
  )
}

// Fila de chips para un filtro de lista corta (cuenta / tarjeta) dentro del
// panel avanzado. Tocar el chip activo lo desactiva (vuelve a "todas").
function ChipFilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: string; name: string }[]
  value?: string
  onChange: (v: string | undefined) => void
}) {
  return (
    <div className="space-y-1.5">
      <FilterLabel>{label}</FilterLabel>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(active ? undefined : o.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors active:scale-[0.97]',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-foreground',
              )}
            >
              {o.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Opción de categoría con punto-avatar de color real + icono real,
// para que los Select se vean coloridos y MonAi (no solo texto plano).
function CategoryOption({ category }: { category: CategoryRow }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
        style={categoryTint(category.color)}
      >
        {createElement(categoryIcon(category.icon), {
          className: 'h-3.5 w-3.5',
          strokeWidth: 2.5,
        })}
      </span>
      <span className="font-bold">{category.name}</span>
    </span>
  )
}

function EditTransactionFields({
  tx,
  categories,
  onCancel,
  onSave,
}: {
  tx: TransactionRow
  categories: CategoryRow[]
  onCancel: () => void
  onSave: (patch: {
    date: string
    category_id: string | null
    note: string | null
  }) => Promise<void>
}) {
  const [date, setDate] = useState(tx.date)
  const [categoryId, setCategoryId] = useState<string | null>(tx.category_id)
  const [note, setNote] = useState(tx.note ?? '')
  const impact = calculateTransactionImpact({
    kind: tx.kind,
    amount: Number(tx.amount),
    accountId: tx.account_id,
    counterpartyAccountId: tx.counterparty_account_id,
    cardId: tx.credit_card_id,
    debtId: tx.debt_id,
  })
  const cats = categories.filter((c) => c.kind === tx.kind)

  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        {impact.summary}
      </p>
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">Fecha</p>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={pillInput}
        />
      </div>
      {cats.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Categoría</p>
          <Select
            value={categoryId ?? '__none'}
            onValueChange={(v) => setCategoryId(v === '__none' ? null : v)}
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sin categoría</SelectItem>
              {cats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryOption category={c} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">Nota</p>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={pillInput}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={() =>
            onSave({ date, category_id: categoryId, note: note || null })
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  )
}
