import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Nombre"
          htmlFor="name"
          error={form.formState.errors.name?.message}
        >
          <Input id="name" {...form.register('name')} placeholder="Visa Bancolombia" />
        </FormField>
        <FormField label="Banco" htmlFor="bank">
          <Input id="bank" {...form.register('bank')} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Cupo total"
          error={form.formState.errors.credit_limit?.message}
        >
          <MoneyInput
            value={form.watch('credit_limit')}
            onChange={(v) =>
              form.setValue('credit_limit', v, { shouldValidate: true })
            }
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
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Color" htmlFor="color">
          <ColorPicker
            id="color"
            value={form.watch('color')}
            onChange={(hex) => form.setValue('color', hex, { shouldValidate: true })}
          />
        </FormField>
      </div>

      <FormField label="Observaciones" htmlFor="notes">
        <Textarea id="notes" rows={2} {...form.register('notes')} />
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
