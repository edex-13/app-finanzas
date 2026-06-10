import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { FormField } from '@/components/common/FormField'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MoneyInput } from '@/components/common/MoneyInput'
import { MotionList, MotionItem } from '@/components/common/Motion'
import {
  salaryHistoryEntrySchema,
  type SalaryHistoryEntryInput,
} from '@/lib/validations'
import {
  addDays,
  formatDateShort,
  fromISODate,
  toISODate,
  today,
} from '@/lib/date-utils'
import type { IncomeSourceRow, SalaryHistoryRow } from '@/types/database'
import {
  useAddSalaryEntry,
  useDeleteSalaryEntry,
  useUpdateSalaryEntry,
} from './hooks'

// Input como píldora suave (sistema MonAi: sin caja con borde duro).
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

interface EntryFormProps {
  defaultValues: SalaryHistoryEntryInput
  submitLabel: string
  onSubmit: (values: SalaryHistoryEntryInput) => Promise<void>
}

/** Formulario mínimo de un tramo: monto + desde cuándo rige. */
function SalaryEntryForm({ defaultValues, submitLabel, onSubmit }: EntryFormProps) {
  const form = useForm<SalaryHistoryEntryInput>({
    resolver: zodResolver(salaryHistoryEntrySchema),
    defaultValues,
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
      <FormField
        label="Sueldo mensual (bruto)"
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
      <FormField
        label="Rige desde"
        htmlFor="entry_start_date"
        error={form.formState.errors.start_date?.message}
        hint="El sueldo anterior aplica hasta el día antes de esta fecha."
      >
        <Input
          id="entry_start_date"
          type="date"
          {...form.register('start_date')}
          className={pillInput}
        />
      </FormField>
      <Button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="w-full"
      >
        {submitLabel}
      </Button>
    </form>
  )
}

interface Props {
  income: IncomeSourceRow
  /** Tramos de ESTA fuente, ordenados por start_date ascendente. */
  history: SalaryHistoryRow[]
}

/**
 * "Mis sueldos": timeline vertical de tramos salariales. El más reciente es el
 * vigente; los anteriores muestran su rango real (hasta el día previo al
 * siguiente tramo). Permite registrar aumentos, editar y eliminar tramos.
 */
export function SalaryHistoryEditor({ income, history }: Props) {
  const add = useAddSalaryEntry()
  const update = useUpdateSalaryEntry()
  const del = useDeleteSalaryEntry()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<SalaryHistoryRow | null>(null)

  // Cada tramo con su fin (día antes del siguiente tramo) — más reciente primero.
  const rows = history
    .map((entry, idx) => ({
      entry,
      end:
        idx + 1 < history.length
          ? addDays(fromISODate(history[idx + 1].start_date), -1)
          : null,
      isCurrent: idx === history.length - 1,
    }))
    .reverse()

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight">Mis sueldos</h2>
        <Button variant="pill" size="sm" onClick={() => setOpenNew(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Registrar aumento
        </Button>
      </div>

      <MotionList className="space-y-2.5">
        {rows.map(({ entry, end, isCurrent }) => (
          <MotionItem key={entry.id}>
            <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
                  isCurrent ? 'bg-success/15' : 'bg-secondary'
                }`}
              >
                {isCurrent ? '💼' : '🕰️'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <MoneyDisplay
                    value={Number(entry.monthly_amount)}
                    className="text-sm font-extrabold tnum"
                  />
                  {isCurrent && (
                    <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-bold text-success">
                      Vigente
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {end
                    ? `${formatDateShort(fromISODate(entry.start_date))} — ${formatDateShort(end)} ${end.getFullYear()}`
                    : `Desde ${formatDateShort(fromISODate(entry.start_date))} ${fromISODate(entry.start_date).getFullYear()}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Editar tramo"
                  onClick={() => setEditing(entry)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {history.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Eliminar tramo"
                    onClick={async () => {
                      if (!confirm('¿Eliminar este tramo del historial?')) return
                      await del.mutateAsync({
                        id: entry.id,
                        incomeSourceId: income.id,
                      })
                      toast.success('Tramo eliminado')
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </MotionItem>
        ))}
      </MotionList>

      <ResponsiveModal
        open={openNew}
        onOpenChange={setOpenNew}
        title="Registrar aumento"
        description="Desde esta fecha rige el nuevo sueldo; recalculamos primas y cesantías solos."
      >
        <SalaryEntryForm
          defaultValues={{
            monthly_amount: Number(income.monthly_amount),
            start_date: toISODate(today()),
          }}
          submitLabel="Guardar aumento"
          onSubmit={async (values) => {
            await add.mutateAsync({ incomeSourceId: income.id, input: values })
            toast.success('Aumento registrado')
            setOpenNew(false)
          }}
        />
      </ResponsiveModal>

      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar tramo"
      >
        {editing && (
          <SalaryEntryForm
            defaultValues={{
              monthly_amount: Number(editing.monthly_amount),
              start_date: editing.start_date,
            }}
            submitLabel="Guardar cambios"
            onSubmit={async (values) => {
              await update.mutateAsync({
                id: editing.id,
                incomeSourceId: income.id,
                input: values,
              })
              toast.success('Tramo actualizado')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>
    </section>
  )
}
