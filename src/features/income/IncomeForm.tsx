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
  incomeSourceSchema,
  type IncomeSourceInput,
} from '@/lib/validations'
import { toISODate, today } from '@/lib/date-utils'
import {
  calculateBiweeklySalary,
  calculateEstimatedPrima,
} from '@/lib/financial-calculations'
import { formatMoney } from '@/lib/format'
import type { IncomeSourceRow } from '@/types/database'

interface Props {
  initial?: IncomeSourceRow
  onSubmit: (values: IncomeSourceInput) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
}

export function IncomeForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: Props) {
  const form = useForm<IncomeSourceInput>({
    resolver: zodResolver(incomeSourceSchema),
    defaultValues: {
      name: initial?.name ?? 'Salario',
      monthly_amount: Number(initial?.monthly_amount ?? 0),
      start_date: initial?.start_date ?? toISODate(today()),
      end_date: initial?.end_date ?? undefined,
      payment_type: initial?.payment_type ?? 'monthly',
      is_primary_salary: initial?.is_primary_salary ?? true,
      includes_legal_benefits: initial?.includes_legal_benefits ?? true,
      notes: initial?.notes ?? '',
    },
  })

  const monthly = form.watch('monthly_amount') ?? 0
  const paymentType = form.watch('payment_type')

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        label="Nombre"
        htmlFor="name"
        error={form.formState.errors.name?.message}
      >
        <Input id="name" {...form.register('name')} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Salario mensual"
          error={form.formState.errors.monthly_amount?.message}
        >
          <MoneyInput
            value={form.watch('monthly_amount')}
            onChange={(v) =>
              form.setValue('monthly_amount', v, { shouldValidate: true })
            }
          />
        </FormField>
        <FormField label="Tipo de pago">
          <Select
            value={paymentType}
            onValueChange={(v) =>
              form.setValue('payment_type', v as IncomeSourceInput['payment_type'])
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="biweekly">Quincenal</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {paymentType === 'biweekly' && monthly > 0 && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          Cada quincena recibirías aprox.{' '}
          <span className="font-medium text-foreground">
            {formatMoney(calculateBiweeklySalary(monthly))}
          </span>
          .
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Fecha de inicio"
          htmlFor="start_date"
          error={form.formState.errors.start_date?.message}
        >
          <Input
            id="start_date"
            type="date"
            {...form.register('start_date')}
          />
        </FormField>
        <FormField label="Fecha de fin (opcional)" htmlFor="end_date">
          <Input id="end_date" type="date" {...form.register('end_date')} />
        </FormField>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">¿Incluye prestaciones legales? (CO)</p>
            <p className="text-xs text-muted-foreground">
              Estimaremos prima de junio/diciembre e intereses de cesantías.
            </p>
          </div>
          <Switch
            checked={form.watch('includes_legal_benefits')}
            onCheckedChange={(v) => form.setValue('includes_legal_benefits', v)}
          />
        </div>
        {form.watch('includes_legal_benefits') && monthly > 0 && (
          <p className="text-xs text-muted-foreground">
            Prima semestral estimada:{' '}
            <span className="font-medium text-foreground">
              {formatMoney(calculateEstimatedPrima(monthly, 180))}
            </span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <p className="text-sm font-medium">¿Salario principal?</p>
          <p className="text-xs text-muted-foreground">
            Lo usaremos como referencia en proyecciones.
          </p>
        </div>
        <Switch
          checked={form.watch('is_primary_salary')}
          onCheckedChange={(v) => form.setValue('is_primary_salary', v)}
        />
      </div>

      <FormField label="Notas" htmlFor="notes">
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
