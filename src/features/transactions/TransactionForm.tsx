import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CreditCard as CreditCardIcon,
  Landmark,
  Plus,
  Scale,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import { ColorPicker, PASTEL_SWATCHES } from '@/components/ui/color-picker'
import { cn } from '@/lib/utils'
import { categoryIcon, categoryTint } from '@/lib/category-visual'
import {
  transactionSchema,
  type TransactionInput,
} from '@/lib/validations'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useDebts } from '@/features/debts/hooks'
import { useCategories, useCreateCategory } from './hooks'
import type { TransactionKind } from '@/types/database'
import { toISODate, today } from '@/lib/date-utils'

interface Props {
  defaultKind?: TransactionKind
  /** Valores iniciales para edición (campos descriptivos). */
  initialValues?: Partial<TransactionInput>
  onSubmit: (values: TransactionInput) => Promise<void> | void
  onCancel?: () => void
}

const kindLabel: Record<TransactionKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  debt_payment: 'Pago de deuda',
  card_payment: 'Pago de tarjeta',
  transfer: 'Transferencia',
  adjustment: 'Ajuste',
}

// Icono lucide por tipo (en vez de emoji).
const kindIcon: Record<TransactionKind, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  debt_payment: Landmark,
  card_payment: CreditCardIcon,
  transfer: ArrowLeftRight,
  adjustment: Scale,
}

// Dos tipos protagonistas; el resto va detrás de "Más opciones".
const PRIMARY_KINDS: TransactionKind[] = ['income', 'expense']
const ADVANCED_KINDS: TransactionKind[] = [
  'transfer',
  'debt_payment',
  'card_payment',
  'adjustment',
]

// Lista corta de iconos lucide para el mini-form de "Nueva categoría".
const CATEGORY_ICON_CHOICES = [
  'utensils',
  'car',
  'home',
  'shopping-bag',
  'film',
  'heart-pulse',
  'plug',
  'graduation-cap',
  'wallet',
  'briefcase',
]

// Input estilizado como píldora suave, con borde sutil para destacar del fondo.
const pillInput =
  'h-12 rounded-2xl border border-border bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Chip inactivo: fondo secundario + borde sutil para que SIEMPRE se distinga.
const chipIdle = 'border border-border bg-secondary text-foreground'

export function TransactionForm({
  defaultKind = 'expense',
  initialValues,
  onSubmit,
  onCancel,
}: Props) {
  const { data: accounts = [] } = useAccounts()
  const { data: cards = [] } = useCreditCards()
  const { data: debts = [] } = useDebts()
  const { data: categories = [] } = useCategories()
  const createCategory = useCreateCategory()

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      date: toISODate(today()),
      amount: 0,
      kind: defaultKind,
      category_id: null,
      account_id: null,
      counterparty_account_id: null,
      credit_card_id: null,
      debt_id: null,
      debt_installment_id: null,
      note: '',
      installments_count: null,
      installment_has_interest: false,
      installment_interest_rate: null,
      ...initialValues,
    },
  })

  const kind = form.watch('kind')
  const cardId = form.watch('credit_card_id')
  const installmentsCount = form.watch('installments_count')
  const hasInterest = form.watch('installment_has_interest')
  const filteredCategories = categories.filter((c) => c.kind === kind)
  // Un gasto con tarjeta puede dividirse en cuotas.
  const isCardExpense = kind === 'expense' && !!cardId
  // Categoría seleccionada (para resaltar el chip activo).
  const selectedCategoryId = form.watch('category_id')

  // Panel "Más opciones": abierto de entrada si el tipo activo es avanzado.
  const [showAdvanced, setShowAdvanced] = useState(() =>
    ADVANCED_KINDS.includes(defaultKind),
  )

  // Mini-form de nueva categoría (estado local, no toca el schema de transacción).
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(PASTEL_SWATCHES[0].hex)
  const [newCatIcon, setNewCatIcon] = useState(CATEGORY_ICON_CHOICES[0])

  // Si el tipo de la transacción ya viene avanzado (edición), abre el panel.
  useEffect(() => {
    if (ADVANCED_KINDS.includes(kind)) setShowAdvanced(true)
  }, [kind])

  // Autoselección: si solo hay UNA cuenta y el kind requiere cuenta, elígela.
  const needsAccount =
    kind === 'income' ||
    kind === 'expense' ||
    kind === 'debt_payment' ||
    kind === 'card_payment' ||
    kind === 'transfer' ||
    kind === 'adjustment'
  useEffect(() => {
    if (needsAccount && accounts.length === 1 && !form.getValues('account_id')) {
      form.setValue('account_id', accounts[0].id, { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAccount, accounts])

  // Autoselección de tarjeta única en pago de tarjeta (obligatorio).
  useEffect(() => {
    if (
      kind === 'card_payment' &&
      cards.length === 1 &&
      !form.getValues('credit_card_id')
    ) {
      form.setValue('credit_card_id', cards[0].id, { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cards])

  const handleSelectKind = (k: TransactionKind) => {
    form.setValue('kind', k, { shouldValidate: true })
  }

  const handleCreateCategory = async () => {
    const name = newCatName.trim()
    if (!name) {
      toast.error('Ponle un nombre a la categoría')
      return
    }
    // transfer/adjustment no tienen categorías propias → usa 'expense'.
    const catKind: TransactionKind =
      kind === 'transfer' || kind === 'adjustment' ? 'expense' : kind
    try {
      const created = await createCategory.mutateAsync({
        name,
        kind: catKind,
        color: newCatColor,
        icon: newCatIcon,
      })
      form.setValue('category_id', created.id, { shouldValidate: true })
      setNewCatOpen(false)
      setNewCatName('')
      toast.success('Categoría creada')
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo crear la categoría')
    }
  }

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({
        ...values,
        category_id: values.category_id || null,
        account_id: values.account_id || null,
        counterparty_account_id: values.counterparty_account_id || null,
        credit_card_id: values.credit_card_id || null,
        debt_id: values.debt_id || null,
        debt_installment_id: values.debt_installment_id || null,
        installments_count: isCardExpense ? values.installments_count || null : null,
      })
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-6 px-1" onSubmit={handleSubmit} noValidate>
      {/* Tipo: dos chips grandes protagonistas + "Más opciones". */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Tipo</p>
        <div className="grid grid-cols-2 gap-2.5">
          {PRIMARY_KINDS.map((k) => {
            const active = kind === k
            const Icon = kindIcon[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => handleSelectKind(k)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-extrabold transition-colors active:scale-[0.97]',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : chipIdle,
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2.5} />
                {kindLabel[k]}
              </button>
            )
          })}
        </div>

        {/* Disparador "Más opciones" */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors active:scale-[0.97]"
        >
          Más opciones
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform',
              showAdvanced && 'rotate-180',
            )}
          />
        </button>

        {showAdvanced && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {ADVANCED_KINDS.map((k) => {
              const active = kind === k
              const Icon = kindIcon[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => handleSelectKind(k)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors active:scale-[0.97]',
                    active ? 'bg-primary text-primary-foreground' : chipIdle,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.5} />
                  {kindLabel[k]}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Monto: número protagonista, sin caja. */}
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          {kind === 'adjustment' ? 'Saldo real de la cuenta' : 'Monto'}
        </p>
        <MoneyInput
          value={form.watch('amount')}
          onChange={(v) => form.setValue('amount', v, { shouldValidate: true })}
          className="h-auto rounded-none border-0 bg-transparent px-0 text-4xl font-extrabold tnum placeholder:text-muted-foreground/40 focus-visible:ring-0"
        />
        {form.formState.errors.amount?.message && (
          <p className="text-xs text-destructive">
            {form.formState.errors.amount.message}
          </p>
        )}
      </div>

      <FormField
        label="Fecha"
        htmlFor="date"
        error={form.formState.errors.date?.message}
      >
        <Input id="date" type="date" {...form.register('date')} className={pillInput} />
      </FormField>

      {/* Categoría: grid de chips seleccionables + chip "Nueva" para crear inline. */}
      {kind !== 'transfer' && kind !== 'adjustment' && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Categoría
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredCategories.map((c) => {
              const active = selectedCategoryId === c.id
              const Icon = categoryIcon(c.icon)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    form.setValue('category_id', active ? null : c.id)
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-colors active:scale-[0.97]',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : chipIdle,
                  )}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                    style={active ? undefined : categoryTint(c.color)}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}

            {/* Chip "+ Nueva" para crear categoría inline. */}
            <button
              type="button"
              onClick={() => setNewCatOpen((v) => !v)}
              className={cn(
                'flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-bold transition-colors active:scale-[0.97]',
                newCatOpen
                  ? 'bg-primary text-primary-foreground'
                  : chipIdle,
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted">
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </span>
              <span className="truncate">Nueva</span>
            </button>
          </div>

          {/* Mini-form inline de creación de categoría. */}
          {newCatOpen && (
            <div className="mt-3 space-y-4 rounded-3xl border border-border bg-secondary p-4">
              <FormField label="Nombre">
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ej. Mascotas"
                  className="h-12 rounded-2xl border border-border bg-card px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </FormField>

              <FormField label="Color">
                <ColorPicker value={newCatColor} onChange={setNewCatColor} />
              </FormField>

              <FormField label="Icono">
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ICON_CHOICES.map((name) => {
                    const Icon = categoryIcon(name)
                    const active = newCatIcon === name
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setNewCatIcon(name)}
                        aria-pressed={active}
                        className={cn(
                          'grid h-11 w-11 place-items-center rounded-2xl transition-transform active:scale-90',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'border border-border bg-card text-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                    )
                  })}
                </div>
              </FormField>

              <Button
                type="button"
                onClick={handleCreateCategory}
                disabled={createCategory.isPending}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Crear
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cuenta (origen para transferencia) */}
      {needsAccount && (
        <FormField
          label={
            kind === 'transfer'
              ? 'Cuenta origen'
              : kind === 'adjustment'
                ? 'Cuenta a ajustar'
                : 'Cuenta'
          }
          error={
            kind === 'transfer'
              ? form.formState.errors.counterparty_account_id?.message
              : undefined
          }
        >
          <PillChoice
            options={accounts.map((a) => ({ id: a.id, name: a.name }))}
            value={form.watch('account_id')}
            allowClear
            onChange={(v) =>
              form.setValue('account_id', v, { shouldValidate: true })
            }
          />
        </FormField>
      )}

      {/* Cuenta destino (solo transferencia) */}
      {kind === 'transfer' && (
        <FormField
          label="Cuenta destino"
          error={form.formState.errors.counterparty_account_id?.message}
        >
          <PillChoice
            options={accounts.map((a) => ({ id: a.id, name: a.name }))}
            value={form.watch('counterparty_account_id')}
            allowClear
            onChange={(v) =>
              form.setValue('counterparty_account_id', v, {
                shouldValidate: true,
              })
            }
          />
        </FormField>
      )}

      {/* Tarjeta (gasto opcional / pago de tarjeta obligatorio) */}
      {(kind === 'expense' || kind === 'card_payment') && cards.length > 0 && (
        <FormField
          label={kind === 'card_payment' ? 'Tarjeta a pagar' : 'Tarjeta (opcional)'}
        >
          <PillChoice
            options={cards.map((c) => ({ id: c.id, name: c.name }))}
            value={form.watch('credit_card_id')}
            allowClear
            onChange={(v) => form.setValue('credit_card_id', v)}
          />
        </FormField>
      )}

      {/* Gasto con tarjeta a cuotas: tarjeta suave sin borde duro */}
      {isCardExpense && (
        <div className="space-y-4 rounded-3xl border border-border bg-secondary p-4">
          <FormField label="Número de cuotas (1 = sin diferir)">
            <Input
              type="number"
              min={1}
              value={installmentsCount ?? 1}
              onChange={(e) =>
                form.setValue(
                  'installments_count',
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              className="h-12 rounded-2xl border border-border bg-card px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </FormField>
          {(installmentsCount ?? 1) > 1 && (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <span className="text-sm font-bold">¿Tiene intereses?</span>
                <Switch
                  checked={!!hasInterest}
                  onCheckedChange={(v) =>
                    form.setValue('installment_has_interest', v)
                  }
                />
              </div>
              {hasInterest && (
                <FormField label="Tasa de interés (% anual)">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.watch('installment_interest_rate') ?? 0}
                    onChange={(e) =>
                      form.setValue(
                        'installment_interest_rate',
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="h-12 rounded-2xl border border-border bg-card px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                </FormField>
              )}
            </>
          )}
        </div>
      )}

      {/* Deuda (solo pago de deuda) */}
      {kind === 'debt_payment' && debts.length > 0 && (
        <FormField label="Deuda">
          <PillChoice
            options={debts.map((d) => ({ id: d.id, name: d.name }))}
            value={form.watch('debt_id')}
            allowClear
            onChange={(v) => form.setValue('debt_id', v)}
          />
        </FormField>
      )}

      <FormField
        label={
          kind === 'adjustment'
            ? 'Descripción del ajuste (obligatoria)'
            : 'Nota'
        }
        htmlFor="note"
        error={form.formState.errors.note?.message}
      >
        <Textarea
          id="note"
          rows={2}
          {...form.register('note')}
          className="rounded-2xl border border-border bg-secondary px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </FormField>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full sm:w-auto"
        >
          <Check className="mr-2 h-4 w-4" />
          Guardar
        </Button>
      </div>
    </form>
  )
}

// Selector en píldoras-chip para listas cortas (cuenta, tarjeta, deuda).
// Reemplaza al <select> nativo: tocar un chip lo selecciona; si `allowClear`,
// tocar el chip activo lo deselecciona (vuelve a `null`).
function PillChoice({
  options,
  value,
  onChange,
  allowClear,
}: {
  options: { id: string; name: string }[]
  value?: string | null
  onChange: (v: string | null) => void
  allowClear?: boolean
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
        Nada para elegir todavía.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(active && allowClear ? null : o.id)}
            className={cn(
              'rounded-full px-4 py-2.5 text-sm font-bold transition-colors active:scale-[0.97]',
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-secondary text-foreground',
            )}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}
