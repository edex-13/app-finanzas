import { useState } from 'react'
import { LineChart as LineChartIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProjectionLineChart } from '@/components/charts/ProjectionLineChart'
import { useProjection } from '@/hooks/useProjection'
import { formatDateShort } from '@/lib/date-utils'
import { cn } from '@/lib/utils'

const horizons = [
  { value: 30, label: '30 días' },
  { value: 60, label: '60 días' },
  { value: 90, label: '90 días' },
  { value: 180, label: '6 meses' },
]

const sourceLabel: Record<string, string> = {
  recurring: 'Recurrente',
  debt_installment: 'Cuota deuda',
  salary_period: 'Salario',
  one_off: 'Puntual',
}

// Chip pastel apagado por fuente (texto oscuro sobre pastel, estilo MonAi).
const sourceChipClass: Record<string, string> = {
  recurring: 'bg-pastel-lavender text-black/70',
  debt_installment: 'bg-pastel-terracotta text-black/70',
  salary_period: 'bg-pastel-mint text-black/70',
  one_off: 'bg-pastel-sand text-black/70',
}

export function ProjectionsPage() {
  const [horizon, setHorizon] = useState(90)
  const { events, startBalance, isLoading } = useProjection({
    horizonDays: horizon,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyección financiera"
        description="Línea de tiempo combinando ingresos esperados, deudas y recurrentes."
        action={
          <Select
            value={String(horizon)}
            onValueChange={(v) => setHorizon(Number(v))}
          >
            <SelectTrigger className="h-11 w-[140px] rounded-2xl border-0 bg-secondary px-4 text-sm font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {horizons.map((h) => (
                <SelectItem key={h.value} value={String(h.value)}>
                  {h.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Gráfica de saldo esperado (ya rediseñada, no se toca el chart). */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-extrabold tracking-tight">Saldo esperado</h2>
          <span className="text-[11px] text-muted-foreground">
            Empieza en{' '}
            <MoneyDisplay value={startBalance} className="tnum font-bold text-foreground" />
          </span>
        </div>
        <div className="rounded-3xl bg-card p-4 shadow-soft">
          {isLoading ? (
            <Skeleton className="h-[260px] w-full rounded-2xl" />
          ) : (
            <ProjectionLineChart
              events={events}
              startBalance={startBalance}
              horizonDays={horizon}
            />
          )}
        </div>
      </section>

      {/* Línea de tiempo como filas-píldora estilo MonAi. */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold tracking-tight">Línea de tiempo</h2>
        {events.length === 0 ? (
          <EmptyState
            icon={<LineChartIcon className="h-8 w-8" />}
            title="Sin eventos futuros"
            description="Agrega recurrentes, deudas o ingresos para ver tu proyección."
          />
        ) : (
          <MotionList className="space-y-2.5">
            {events.map((e, i) => (
              <MotionItem key={i}>
                <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-soft">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{e.description}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold',
                          sourceChipClass[e.source] ?? 'bg-secondary text-foreground',
                        )}
                      >
                        {sourceLabel[e.source] ?? e.source}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateShort(e.date)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <MoneyDisplay
                      value={e.signedAmount}
                      showSign
                      positiveClass="text-success"
                      className="block text-sm font-extrabold tnum"
                    />
                    <MoneyDisplay
                      value={e.runningBalance}
                      className="mt-0.5 block text-[11px] font-bold tnum text-muted-foreground"
                    />
                  </div>
                </div>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </section>
    </div>
  )
}
