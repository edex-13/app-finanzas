import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatMoney } from '@/lib/format'

interface Props {
  income: number
  expense: number
}

/**
 * Mini-comparativa Ingresos vs Gastos del periodo. Dos barras muy redondeadas:
 * verde pastel para ingreso, coral para gasto (alerta visual del flujo de salida).
 */
export function IncomeExpenseChart({ income, expense }: Props) {
  const data = [
    { name: 'Ingresos', value: income, fill: 'hsl(var(--pastel-mint))' },
    { name: 'Gastos', value: expense, fill: 'hsl(var(--destructive))' },
  ]
  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 700 }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', radius: 16 }}
            content={(props) => <SoftTooltip {...props} />}
          />
          <Bar dataKey="value" radius={[16, 16, 16, 16]} maxBarSize={64}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SoftTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl bg-card px-3.5 py-2.5 shadow-soft">
      <p className="text-[11px] text-muted-foreground">{String(label)}</p>
      <p className="tnum text-sm font-extrabold text-foreground">
        {formatMoney(Number(payload[0].value))}
      </p>
    </div>
  )
}
