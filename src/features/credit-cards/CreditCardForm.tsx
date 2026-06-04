import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import { ColorPicker } from '@/components/ui/color-picker'
import {
  creditCardSchema,
  type CreditCardInput,
} from '@/lib/validations'
import type { CreditCardRow } from '@/types/database'

interface Props {
  initial?: CreditCardRow
  onSubmit: (values: CreditCardInput) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
}

// Input/MoneyInput como píldora suave (sin caja con borde duro).
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Textarea como píldora suave.
const pillTextarea =
  'rounded-2xl border-0 bg-secondary px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring/40'

export function CreditCardForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: Props) {
  const form = useForm<CreditCardInput>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: {
      name: initial?.name ?? '',
      bank: initial?.bank ?? '',
      credit_limit: Number(initial?.credit_limit ?? 0),
      current_debt: Number(initial?.current_debt ?? 0),
      statement_day: initial?.statement_day ?? 15,
      payment_due_day: initial?.payment_due_day ?? 5,
      color: initial?.color ?? '',
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

  // Color elegido en vivo (refleja la selección del ColorPicker).
  const accentColor = form.watch('color') || 'hsl(var(--primary))'
  const previewName = form.watch('name')?.trim()
  const previewBank = form.watch('bank')?.trim()

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {/* Preview en vivo: el acento se pinta con el color elegido. */}
      <div
        className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
        style={{ borderLeft: `4px solid ${accentColor}` }}
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: accentColor }}
        >
          <CreditCard className="h-5 w-5 text-black/70" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {previewName || 'Nueva tarjeta'}
          </p>
          {previewBank && (
            <p className="truncate text-xs text-muted-foreground">
              {previewBank}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Nombre"
          htmlFor="name"
          error={form.formState.errors.name?.message}
        >
          <Input
            id="name"
            {...form.register('name')}
            placeholder="Visa Bancolombia"
            className={pillInput}
          />
        </FormField>
        <FormField label="Banco" htmlFor="bank">
          <Input id="bank" {...form.register('bank')} className={pillInput} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Cupo total"
          error={form.formState.errors.credit_limit?.message}
        >
          <MoneyInput
            value={form.watch('credit_limit')}
            onChange={(v) =>
              form.setValue('credit_limit', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
        <FormField
          label="Deuda actual"
          error={form.formState.errors.current_debt?.message}
        >
          <MoneyInput
            value={form.watch('current_debt')}
            onChange={(v) =>
              form.setValue('current_debt', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Día de corte (1-31)"
          htmlFor="statement_day"
          error={form.formState.errors.statement_day?.message}
        >
          <Input
            id="statement_day"
            type="number"
            min={1}
            max={31}
            {...form.register('statement_day', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
        <FormField
          label="Día máximo de pago (1-31)"
          htmlFor="payment_due_day"
          error={form.formState.errors.payment_due_day?.message}
        >
          <Input
            id="payment_due_day"
            type="number"
            min={1}
            max={31}
            {...form.register('payment_due_day', { valueAsNumber: true })}
            className={pillInput}
          />
        </FormField>
      </div>

      <FormField label="Color" htmlFor="color">
        <ColorPicker
          id="color"
          value={form.watch('color')}
          onChange={(hex) => form.setValue('color', hex, { shouldValidate: true })}
        />
      </FormField>

      <FormField label="Observaciones" htmlFor="notes">
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
