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
import { debtSchema, type DebtInput } from '@/lib/validations'
import type { DebtRow } from '@/types/database'
import { toISODate, today } from '@/lib/date-utils'
import { useCreditCards } from '@/features/credit-cards/hooks'

interface Props {
  initial?: DebtRow
  onSubmit: (values: DebtInput) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
}

const typeOptions: { value: DebtInput['debt_type']; label: string }[] = [
  { value: 'loan', label: 'Préstamo' },
  { value: 'mortgage', label: 'Hipoteca' },
  { value: 'credit_card', label: 'Tarjeta' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Otra' },
]

const freqOptions: { value: DebtInput['payment_frequency']; label: string }[] = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'custom', label: 'Otra' },
]

// Trigger de Select como píldora suave (sin caja con borde duro).
const pillTrigger =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0'

// Input/MoneyInput como píldora suave.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Textarea como píldora suave.
const pillTextarea =
  'rounded-2xl border-0 bg-secondary px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring/40'

export function DebtForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: Props) {
  const { data: cards = [] } = useCreditCards()
  const form = useForm<DebtInput>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      name: initial?.name ?? '',
      debt_type: initial?.debt_type ?? 'loan',
      total_amount: Number(initial?.total_amount ?? 0),
      remaining_balance: Number(initial?.remaining_balance ?? 0),
      interest_rate: Number(initial?.interest_rate ?? 0),
      has_interest: initial?.has_interest ?? true,
      payment_frequency: initial?.payment_frequency ?? 'monthly',
      next_payment_date: initial?.next_payment_date ?? toISODate(today()),
      total_installments: initial?.total_installments ?? undefined,
      remaining_installments: initial?.remaining_installments ?? undefined,
      approx_installment_amount: Number(initial?.approx_installment_amount ?? 0),
      payment_method_account_id: initial?.payment_method_account_id ?? null,
      payment_method_card_id: initial?.payment_method_card_id ?? null,
      notes: initial?.notes ?? '',
    },
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Nombre"
          htmlFor="name"
          error={form.formState.errors.name?.message}
        >
          <Input
            id="name"
            {...form.register('name')}
            placeholder="Crédito vehículo"
            className={pillInput}
          />
        </FormField>
        <FormField label="Tipo de deuda">
          <Select
            value={form.watch('debt_type')}
            onValueChange={(v) =>
              form.setValue('debt_type', v as DebtInput['debt_type'])
            }
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Valor total"
          error={form.formState.errors.total_amount?.message}
        >
          <MoneyInput
            value={form.watch('total_amount')}
            onChange={(v) =>
              form.setValue('total_amount', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
        <FormField
          label="Saldo pendiente"
          error={form.formState.errors.remaining_balance?.message}
        >
          <MoneyInput
            value={form.watch('remaining_balance')}
            onChange={(v) =>
              form.setValue('remaining_balance', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
        <div>
          <p className="text-sm font-bold">¿Tiene intereses?</p>
          <p className="text-xs text-muted-foreground">
            Si es Sí, ingresa la tasa anual aproximada.
          </p>
        </div>
        <Switch
          checked={form.watch('has_interest')}
          onCheckedChange={(v) => form.setValue('has_interest', v)}
        />
      </div>

      {form.watch('has_interest') && (
        <FormField
          label="Tasa de interés anual (%)"
          htmlFor="interest_rate"
          error={form.formState.errors.interest_rate?.message}
        >
          <Input
            id="interest_rate"
            type="number"
            step="0.01"
            {...form.register('interest_rate', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Frecuencia de pago">
          <Select
            value={form.watch('payment_frequency')}
            onValueChange={(v) =>
              form.setValue(
                'payment_frequency',
                v as DebtInput['payment_frequency'],
              )
            }
          >
            <SelectTrigger className={pillTrigger}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {freqOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="Próxima fecha de pago"
          htmlFor="next_payment_date"
          error={form.formState.errors.next_payment_date?.message}
        >
          <Input
            id="next_payment_date"
            type="date"
            {...form.register('next_payment_date')}
            className={pillInput}
          />
        </FormField>
      </div>

      <FormField label="¿Con qué tarjeta la pagas? (opcional)">
        <Select
          value={form.watch('payment_method_card_id') ?? '__none'}
          onValueChange={(v) =>
            form.setValue(
              'payment_method_card_id',
              v === '__none' ? null : v,
            )
          }
        >
          <SelectTrigger className={pillTrigger}>
            <SelectValue placeholder="Ninguna" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Ninguna</SelectItem>
            {cards.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Cuotas totales" htmlFor="total_installments">
          <Input
            id="total_installments"
            type="number"
            min={1}
            {...form.register('total_installments', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
        <FormField label="Cuotas restantes" htmlFor="remaining_installments">
          <Input
            id="remaining_installments"
            type="number"
            min={0}
            {...form.register('remaining_installments', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
        <FormField
          label="Valor cuota aprox."
          error={form.formState.errors.approx_installment_amount?.message}
        >
          <MoneyInput
            value={form.watch('approx_installment_amount')}
            onChange={(v) =>
              form.setValue('approx_installment_amount', v, {
                shouldValidate: true,
              })
            }
            className={pillInput}
          />
        </FormField>
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
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
