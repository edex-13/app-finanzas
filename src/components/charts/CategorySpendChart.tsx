import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from 'recharts'
import { formatMoney } from '@/lib/format'
import { categoryColor } from '@/lib/category-visual'
import type { CategorySpend } from '@/lib/financial-calculations'

interface Props {
  data: CategorySpend[]
  /** Total a mostrar en el centro de la dona. */
  total: number
  /** Tocar un segmento de la dona (p. ej. para filtrar por esa categoría). */
  onSliceClick?: (spend: CategorySpend) => void
}

/**
 * Dona de "gasto por categoría" con los COLORES REALES de cada categoría.
 * Sin leyenda densa: el desglose con chips va al lado en el dashboard.
 * Si recibe onSliceClick, cada segmento es tocable.
 */
export function CategorySpendChart({ data, total, onSliceClick }: Props) {
  if (data.length === 0) {
    return (
      <div className="grid h-[200px] place-items-center text-sm text-muted-foreground">
        Aún no hay gastos registrados.
      </div>
    )
  }
  return (
    <div className="relative h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
            onClick={(_, index) => onSliceClick?.(data[index])}
            cursor={onSliceClick ? 'pointer' : undefined}
          >
            {data.map((d) => (
              <Cell key={d.categoryId ?? 'none'} fill={categoryColor(d.color)} />
            ))}
          </Pie>
          <Tooltip content={(props) => <SoftTooltip {...props} />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Total en el centro */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="text-[11px] font-semibold text-muted-foreground">Gasto</p>
          <p className="tnum text-lg font-extrabold">{formatMoney(total)}</p>
        </div>
      </div>
    </div>
  )
}

function SoftTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-2xl bg-card px-3.5 py-2.5 shadow-soft">
      <p className="text-[11px] text-muted-foreground">{String(p.name)}</p>
      <p className="tnum text-sm font-extrabold text-foreground">
        {formatMoney(Number(p.value))}
      </p>
    </div>
  )
}
