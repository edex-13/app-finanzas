import { useState } from 'react'
import { Briefcase, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { IncomeForm } from './IncomeForm'
import { SalaryHistoryEditor } from './SalaryHistoryEditor'
import {
  useCreateIncomeSource,
  useDeleteIncomeSource,
  useIncomeSources,
  useSalaryHistory,
  useUpdateIncomeSource,
} from './hooks'
import {
  calculateNetSalary,
  calculateYearlyBenefitsFromHistory,
  salaryOnDate,
  type SalarySegment,
} from '@/lib/labor-co'
import { formatMoney } from '@/lib/format'
import { formatDateShort, fromISODate, today } from '@/lib/date-utils'
import type { IncomeSourceRow } from '@/types/database'

export function IncomePage() {
  const { data, isLoading } = useIncomeSources()
  const { data: allHistory } = useSalaryHistory()
  const create = useCreateIncomeSource()
  const update = useUpdateIncomeSource()
  const del = useDeleteIncomeSource()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<IncomeSourceRow | null>(null)

  const sources = data ?? []

  // El salario principal con prestaciones de ley es el protagonista de la
  // página: hero con neto, historial de sueldos y prestaciones del año.
  const salary =
    sources.find((i) => i.is_primary_salary && i.includes_legal_benefits) ??
    null
  const others = sources.filter((i) => i.id !== salary?.id)

  const salaryHistory = (allHistory ?? []).filter(
    (h) => h.income_source_id === salary?.id,
  )
  // Fallback si el historial aún no cargó: un solo tramo con el sueldo actual.
  const segments: SalarySegment[] =
    salaryHistory.length > 0
      ? salaryHistory
      : salary
        ? [
            {
              monthly_amount: Number(salary.monthly_amount),
              start_date: salary.start_date,
            },
          ]
        : []

  const gross = salary ? salaryOnDate(segments, today()) : 0
  const breakdown = gross > 0 ? calculateNetSalary(gross) : null

  const year = today().getFullYear()
  const benefits = salary
    ? calculateYearlyBenefitsFromHistory(segments, year, {
        start: fromISODate(salary.start_date),
        end: salary.end_date ? fromISODate(salary.end_date) : null,
      })
    : null

  const benefitRows = benefits
    ? [
        {
          key: 'prima-jun',
          emoji: '🎁',
          title: 'Prima de junio',
          sub: `≈ ${formatDateShort(new Date(year, 5, 30))} · a tu cuenta`,
          amount: benefits.primaJun,
          avatar: 'bg-pastel-mint/20',
          amountClass: 'text-pastel-mint',
        },
        {
          key: 'prima-dec',
          emoji: '🎁',
          title: 'Prima de diciembre',
          sub: `≈ ${formatDateShort(new Date(year, 11, 20))} · a tu cuenta`,
          amount: benefits.primaDec,
          avatar: 'bg-pastel-mint/20',
          amountClass: 'text-pastel-mint',
        },
        {
          key: 'intereses',
          emoji: '📈',
          title: 'Intereses de cesantías',
          sub: `ene ${year + 1} · a tu cuenta`,
          amount: benefits.cesantiasInterest,
          avatar: 'bg-pastel-lavender/20',
          amountClass: 'text-pastel-lavender',
        },
        {
          key: 'cesantias',
          emoji: '🏦',
          title: 'Cesantías',
          sub: 'Van a tu fondo, no a tu cuenta',
          amount: benefits.cesantias,
          avatar: 'bg-pastel-sand/20',
          amountClass: 'text-pastel-sand',
        },
      ]
    : []

  return (
    <div className="space-y-8">
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

      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-3xl" />
      ) : sources.length === 0 ? (
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
        <>
          {/* ------------------------------------------------------------- */}
          {/* Hero: neto mensual actual del salario principal               */}
          {/* ------------------------------------------------------------- */}
          {salary && (
            <section className="rounded-3xl bg-card px-5 py-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{salary.name}</p>
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {salary.payment_type === 'biweekly'
                      ? 'Quincenal'
                      : 'Mensual'}{' '}
                    · prestaciones de ley
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Editar fuente"
                    onClick={() => setEditing(salary)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Eliminar fuente"
                    onClick={async () => {
                      if (!confirm(`¿Eliminar "${salary.name}"?`)) return
                      await del.mutateAsync(salary.id)
                      toast.success('Ingreso eliminado')
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  Neto a tu cuenta cada mes
                </p>
                <MoneyDisplay
                  value={breakdown?.net ?? gross}
                  className="text-hero text-5xl sm:text-6xl"
                />
              </div>

              {breakdown && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold">
                    Bruto {formatMoney(breakdown.gross)}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    Salud −{formatMoney(breakdown.health)}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    Pensión −{formatMoney(breakdown.pension)}
                  </span>
                  {breakdown.fsp > 0 && (
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                      FSP −{formatMoney(breakdown.fsp)}
                    </span>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Historial de sueldos                                          */}
          {/* ------------------------------------------------------------- */}
          {salary && salaryHistory.length > 0 && (
            <SalaryHistoryEditor income={salary} history={salaryHistory} />
          )}

          {/* ------------------------------------------------------------- */}
          {/* Prestaciones de este año (con los sueldos reales)             */}
          {/* ------------------------------------------------------------- */}
          {salary && benefits && (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-extrabold tracking-tight">
                  Prestaciones de este año
                </h2>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-muted-foreground">
                  {year}
                </span>
              </div>

              <div className="rounded-3xl bg-card px-5 py-4 shadow-soft">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Llega a tu cuenta este año
                </p>
                <MoneyDisplay
                  value={benefits.cashToAccount}
                  className="text-3xl font-extrabold tracking-tight tnum"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Primas + intereses de cesantías, calculados con tus sueldos
                  reales de cada periodo.
                </p>
              </div>

              <MotionList className="space-y-2.5">
                {benefitRows.map((r) => (
                  <MotionItem key={r.key}>
                    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${r.avatar}`}
                      >
                        {r.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.sub}
                        </p>
                      </div>
                      <MoneyDisplay
                        value={r.amount}
                        className={`shrink-0 text-sm font-extrabold tnum ${r.amountClass}`}
                      />
                    </div>
                  </MotionItem>
                ))}
              </MotionList>
            </section>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Otras fuentes de ingreso                                      */}
          {/* ------------------------------------------------------------- */}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-extrabold tracking-tight">
                {salary ? 'Otras fuentes' : 'Fuentes de ingreso'}
              </h2>
              <MotionList className="grid gap-2.5 sm:grid-cols-2">
                {others.map((i) => (
                  <MotionItem key={i.id}>
                    <div className="rounded-2xl bg-card px-4 py-3 shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{i.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.payment_type === 'biweekly'
                              ? 'Quincenal'
                              : 'Mensual'}
                            {i.includes_legal_benefits
                              ? ' · prestaciones de ley'
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Editar fuente"
                            onClick={() => setEditing(i)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar fuente"
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
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <MoneyDisplay
                          value={Number(i.monthly_amount)}
                          className="text-2xl font-extrabold tracking-tight tnum"
                        />
                        <span className="text-xs font-bold text-muted-foreground">
                          / mes
                        </span>
                      </div>
                    </div>
                  </MotionItem>
                ))}
              </MotionList>
            </section>
          )}
        </>
      )}

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
