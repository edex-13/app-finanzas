import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import {
  recurringTransactionSchema,
  type RecurringTransactionInput,
} from '@/lib/validations'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useCategories } from './hooks'
import type { RecurrenceFrequency } from '@/types/database'
import { toISODate, today } from '@/lib/date-utils'

interface Props {
  onSubmit: (values: RecurringTransactionInput) => Promise<void> | void
  onCancel?: () => void
}

const freqLabel: Record<RecurrenceFrequency, string> = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  yearly: 'Anual',
}

// Trigger de Select como píldora suave (sin caja con borde duro).
const pillTrigger =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0'

// Input/MoneyInput como píldora suave.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Textarea como píldora suave.
const pillTextarea =
  'rounded-2xl border-0 bg-secondary px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring/40'

export function RecurringForm({ onSubmit, onCancel }: Props) {
  const { data: accounts = [] } = useAccounts()
  const { data: cards = [] } = useCreditCards()
  const { data: categories = [] } = useCategories()

  const form = useForm<RecurringTransactionInput>({
    resolver: zodResolver(recurringTransactionSchema),
    defaultValues: {
      name: '',
      kind: 'expense',
      amount: 0,
      frequency: 'monthly',
      interval_count: 1,
      start_date: toISODate(today()),
      next_occurrence_date: toISODate(today()),
      active: true,
      notes: '',
      category_id: null,
      account_id: null,
      credit_card_id: null,
      debt_id: null,
    },
  })

  const kind = form.watch('kind')

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({
        ...values,
        category_id: values.category_id || null,
        account_id: values.account_id || null,
        credit_card_id: values.credit_card_id || null,
        debt_id: values.debt_id || null,
      })
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <FormField
        label="Nombre"
        htmlFor="name"
        error={form.formState.errors.name?.message}
      >
        <Input
          id="name"
          {...form.register('name')}
          placeholder="Arriendo, Netflix, etc."
          className={pillInput}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Tipo">
          <Select
            value={kind}
            onValueChange={(v) =>
              form.setValue('kind', v as RecurringTransactionInput['kind'], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Gasto</SelectItem>
              <SelectItem value="income">Ingreso</SelectItem>
              <SelectItem value="card_payment">Pago de tarjeta</SelectItem>
              <SelectItem value="debt_payment">Pago de deuda</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="Monto"
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            value={form.watch('amount')}
            onChange={(v) =>
              form.setValue('amount', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Frecuencia">
          <Select
            value={form.watch('frequency')}
            onValueChange={(v) =>
              form.setValue('frequency', v as RecurrenceFrequency)
            }
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(freqLabel) as RecurrenceFrequency[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {freqLabel[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Cada N períodos" htmlFor="interval_count">
          <Input
            id="interval_count"
            type="number"
            min={1}
            {...form.register('interval_count', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Próxima ocurrencia"
          htmlFor="next_occurrence_date"
          error={form.formState.errors.next_occurrence_date?.message}
        >
          <Input
            id="next_occurrence_date"
            type="date"
            {...form.register('next_occurrence_date')}
            className={pillInput}
          />
        </FormField>
        <FormField label="Fecha de fin (opcional)" htmlFor="end_date">
          <Input
            id="end_date"
            type="date"
            {...form.register('end_date')}
            className={pillInput}
          />
        </FormField>
      </div>

      <FormField label="Categoría">
        <Select
          value={form.watch('category_id') ?? ''}
          onValueChange={(v) =>
            form.setValue('category_id', v === '__none' ? null : v)
          }
        >
          <SelectTrigger className={pillTrigger}>
            <SelectValue placeholder="Sin categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Sin categoría</SelectItem>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Cuenta">
        <Select
          value={form.watch('account_id') ?? ''}
          onValueChange={(v) =>
            form.setValue('account_id', v === '__none' ? null : v)
          }
        >
          <SelectTrigger className={pillTrigger}>
            <SelectValue placeholder="Ninguna" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Ninguna</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {cards.length > 0 && (
        <FormField label="Tarjeta (opcional)">
          <Select
            value={form.watch('credit_card_id') ?? ''}
            onValueChange={(v) =>
              form.setValue('credit_card_id', v === '__none' ? null : v)
            }
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue placeholder="Sin tarjeta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sin tarjeta</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
        <p className="text-sm font-bold">Activa</p>
        <Switch
          checked={form.watch('active')}
          onCheckedChange={(v) => form.setValue('active', v)}
        />
      </div>

      <FormField label="Notas" htmlFor="notes">
        <Textarea
          id="notes"
          rows={2}
          {...form.register('notes')}
          className={pillTextarea}
        />
      </FormField>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
          Guardar
        </Button>
      </div>
    </form>
  )
}
