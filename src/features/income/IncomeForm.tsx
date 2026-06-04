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
import { fromISODate, toISODate, today } from '@/lib/date-utils'
import { differenceInCalendarDays } from 'date-fns'
import { calculateBiweeklySalary } from '@/lib/financial-calculations'
import {
  calculateNetSalary,
  calculateYearlyBenefits,
  LABOR_YEAR_DAYS,
} from '@/lib/labor-co'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { formatMoney } from '@/lib/format'
import type { IncomeSourceRow } from '@/types/database'

const BENEFITS_YEAR = 2026

/** Días trabajados en el año base según la fecha de inicio (tope 360). */
function daysWorkedInYear(startDate: string | undefined): number {
  if (!startDate) return LABOR_YEAR_DAYS
  const start = fromISODate(startDate)
  const yearStart = new Date(BENEFITS_YEAR, 0, 1)
  const yearEnd = new Date(BENEFITS_YEAR, 11, 31)
  if (start <= yearStart) return LABOR_YEAR_DAYS
  if (start > yearEnd) return 0
  const days = differenceInCalendarDays(yearEnd, start) + 1
  return Math.max(0, Math.min(LABOR_YEAR_DAYS, days))
}

interface Props {
  initial?: IncomeSourceRow
  onSubmit: (values: IncomeSourceInput) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
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
  const includesBenefits = form.watch('includes_legal_benefits')
  const startDate = form.watch('start_date')

  // Preview en vivo del desglose neto + prestaciones (solo cuando aplica).
  const showBenefitsPreview = includesBenefits && monthly > 0
  const breakdown = showBenefitsPreview ? calculateNetSalary(monthly) : null
  const yearly = showBenefitsPreview
    ? calculateYearlyBenefits(monthly, daysWorkedInYear(startDate))
    : null

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values)
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
        <Input id="name" {...form.register('name')} className={pillInput} />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Salario mensual"
          error={form.formState.errors.monthly_amount?.message}
        >
          <MoneyInput
            value={form.watch('monthly_amount')}
            onChange={(v) =>
              form.setValue('monthly_amount', v, { shouldValidate: true })
            }
            className={pillInput}
          />
        </FormField>
        <FormField label="Tipo de pago">
          <Select
            value={paymentType}
            onValueChange={(v) =>
              form.setValue('payment_type', v as IncomeSourceInput['payment_type'])
            }
          >
            <SelectTrigger className={pillTrigger}>
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
        <p className="rounded-2xl bg-secondary p-4 text-xs text-muted-foreground">
          Cada quincena recibirías aprox.{' '}
          <span className="font-bold text-foreground">
            {formatMoney(calculateBiweeklySalary(monthly))}
          </span>
          .
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Fecha de inicio"
          htmlFor="start_date"
          error={form.formState.errors.start_date?.message}
        >
          <Input
            id="start_date"
            type="date"
            {...form.register('start_date')}
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

      <div className="space-y-3 rounded-2xl bg-secondary p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold">¿Incluye prestaciones legales? (CO)</p>
            <p className="text-xs text-muted-foreground">
              Estimaremos prima de junio/diciembre e intereses de cesantías.
            </p>
          </div>
          <Switch
            checked={form.watch('includes_legal_benefits')}
            onCheckedChange={(v) => form.setValue('includes_legal_benefits', v)}
          />
        </div>
        {breakdown && yearly && (
          <div className="space-y-3 rounded-2xl bg-card p-4">
            {/* Neto a la cuenta: número protagonista. */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                Neto a tu cuenta
              </p>
              <div className="flex items-baseline gap-1.5">
                <MoneyDisplay
                  value={breakdown.net}
                  className="text-3xl font-extrabold text-primary"
                />
                <span className="text-xs font-bold text-muted-foreground">
                  / mes
                </span>
              </div>
            </div>

            {/* Desglose de deducciones, en gris. */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Salud −{formatMoney(breakdown.health)}
              </span>
              <span>
                Pensión −{formatMoney(breakdown.pension)}
              </span>
              {breakdown.fsp > 0 && (
                <span>FSP −{formatMoney(breakdown.fsp)}</span>
              )}
            </div>

            {/* Prestaciones del año. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Prestaciones {BENEFITS_YEAR}: prima{' '}
              <span className="font-bold text-foreground">
                {formatMoney(yearly.prima)}
              </span>{' '}
              + intereses{' '}
              <span className="font-bold text-foreground">
                {formatMoney(yearly.cesantiasInterest)}
              </span>{' '}
              van a tu cuenta; cesantías{' '}
              <span className="font-bold text-foreground">
                {formatMoney(yearly.cesantias)}
              </span>{' '}
              al fondo.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
        <div>
          <p className="text-sm font-bold">¿Salario principal?</p>
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
