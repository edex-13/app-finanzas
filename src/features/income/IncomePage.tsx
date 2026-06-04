import { useState } from 'react'
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { IncomeForm } from './IncomeForm'
import {
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeSources,
  useUpdateIncomeSource,
} from './hooks'
import {
  calculateYearlyBenefits,
  LABOR_YEAR_DAYS,
} from '@/lib/labor-co'
import { fromISODate } from '@/lib/date-utils'
import { differenceInCalendarDays } from 'date-fns'
import type { IncomeSourceRow } from '@/types/database'

const BENEFITS_YEAR = 2026

/**
 * Días trabajados en el año base (2026), según la fecha de inicio de la fuente:
 * - empezó antes de 2026 → 360 (año completo contable)
 * - empezó durante 2026 → desde su inicio hasta fin de año (tope 360)
 */
function daysWorkedInYear(startDate: string): number {
  const start = fromISODate(startDate)
  const yearStart = new Date(BENEFITS_YEAR, 0, 1)
  const yearEnd = new Date(BENEFITS_YEAR, 11, 31)
  if (start <= yearStart) return LABOR_YEAR_DAYS
  if (start > yearEnd) return 0
  const days = differenceInCalendarDays(yearEnd, start) + 1
  return Math.max(0, Math.min(LABOR_YEAR_DAYS, days))
}

export function IncomePage() {
  const { data, isLoading } = useIncomeSources()
  const create = useCreateIncomeSource()
  const update = useUpdateIncomeSource()
  const del = useDeleteIncomeSource()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<IncomeSourceRow | null>(null)

  // Fuentes con prestaciones de ley activas (para la sección del año).
  const withBenefits = (data ?? []).filter(
    (i) => i.includes_legal_benefits && Number(i.monthly_amount) > 0,
  )

  // Totales del año sumando todas las fuentes con prestaciones.
  const yearTotals = withBenefits.reduce(
    (acc, i) => {
      const b = calculateYearlyBenefits(
        Number(i.monthly_amount),
        daysWorkedInYear(i.start_date),
      )
      acc.prima += b.prima
      acc.cesantiasInterest += b.cesantiasInterest
      acc.cesantias += b.cesantias
      acc.cashToAccount += b.cashToAccount
      return acc
    },
    { prima: 0, cesantiasInterest: 0, cesantias: 0, cashToAccount: 0 },
  )

  return (
    <div>
      <PageHeader
        title="Ingresos"
        description="Salario y otras fuentes recurrentes."
        action={
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo ingreso
          </Button>
        }
      />

      <ResponsiveModal
        open={openNew}
        onOpenChange={setOpenNew}
        title="Nuevo ingreso"
        className="sm:max-w-xl"
      >
        <IncomeForm
          onCancel={() => setOpenNew(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            toast.success('Ingreso registrado')
            setOpenNew(false)
          }}
        />
      </ResponsiveModal>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-8 w-8" />}
          title="Aún no registras ingresos"
          description="Registrar tu salario nos permite proyectar tu flujo."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear ingreso
            </Button>
          }
        />
      ) : (
        <MotionList className="grid gap-3 sm:grid-cols-2">
          {data.map((i) => (
            <MotionItem key={i.id}>
            <Card>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.payment_type === 'biweekly' ? 'Quincenal' : 'Mensual'}
                      {i.includes_legal_benefits ? ' · prestaciones legales' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(i)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${i.name}"?`)) return
                        await del.mutateAsync(i.id)
                        toast.success('Ingreso eliminado')
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <MoneyDisplay
                  value={Number(i.monthly_amount)}
                  className="text-2xl font-semibold"
                />
                <p className="text-xs text-muted-foreground">/ mes</p>
              </CardContent>
            </Card>
            </MotionItem>
          ))}
        </MotionList>
      )}

      {withBenefits.length > 0 && (
        <section className="mt-8 space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">
              Prestaciones de ley
            </h2>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
              {BENEFITS_YEAR}
            </span>
          </div>

          {/* Resumen: total que entra a la cuenta en el año. */}
          <div className="rounded-3xl bg-card px-5 py-5">
            <p className="text-sm font-semibold text-muted-foreground">
              Total a tu cuenta este año
            </p>
            <MoneyDisplay
              value={yearTotals.cashToAccount}
              className="text-hero text-5xl text-primary sm:text-6xl"
            />
            <div className="mt-3 flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-mint/15 px-3.5 py-1.5 text-sm font-bold text-pastel-mint">
                🎁 Prima{' '}
                <MoneyDisplay value={yearTotals.prima} className="tnum" />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lavender/15 px-3.5 py-1.5 text-sm font-bold text-pastel-lavender">
                📈 Intereses{' '}
                <MoneyDisplay
                  value={yearTotals.cesantiasInterest}
                  className="tnum"
                />
              </span>
            </div>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-pastel-sand/15 px-3.5 py-1.5 text-xs font-bold text-pastel-sand">
              🏦 Cesantías{' '}
              <MoneyDisplay value={yearTotals.cesantias} className="tnum" /> · van
              al fondo, no a tu cuenta
            </p>
          </div>

          {/* Desglose por fuente. */}
          <MotionList className="space-y-2.5">
            {withBenefits.map((i) => {
              const b = calculateYearlyBenefits(
                Number(i.monthly_amount),
                daysWorkedInYear(i.start_date),
              )
              return (
                <MotionItem key={i.id}>
                  <div className="rounded-2xl bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold">{i.name}</p>
                      <MoneyDisplay
                        value={b.cashToAccount}
                        className="text-sm font-extrabold text-primary"
                      />
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
                        🎁 Prima{' '}
                        <MoneyDisplay
                          value={b.prima}
                          className="tnum text-pastel-mint"
                        />
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
                        📈 Intereses{' '}
                        <MoneyDisplay
                          value={b.cesantiasInterest}
                          className="tnum text-pastel-lavender"
                        />
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground">
                        🏦 Cesantías{' '}
                        <MoneyDisplay
                          value={b.cesantias}
                          className="tnum text-pastel-sand"
                        />{' '}
                        · al fondo
                      </span>
                    </div>
                  </div>
                </MotionItem>
              )
            })}
          </MotionList>
        </section>
      )}

      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar ingreso"
        className="sm:max-w-xl"
      >
        {editing && (
          <IncomeForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: editing.id, input: values })
              toast.success('Actualizado')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>
    </div>
  )
}
