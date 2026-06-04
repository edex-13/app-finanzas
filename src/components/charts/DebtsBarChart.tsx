import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatMoney, formatMoneyCompact } from '@/lib/format'

interface DebtPoint {
  name: string
  amount: number
}

interface Props {
  data: DebtPoint[]
}

// Pasteles variados del design system, rotados por índice.
const TONES = [
  'hsl(var(--pastel-lavender))',
  'hsl(var(--pastel-blue))',
  'hsl(var(--pastel-mint))',
  'hsl(var(--pastel-rose))',
  'hsl(var(--pastel-mustard))',
  'hsl(var(--pastel-olive))',
]

export function DebtsBarChart({ data }: Props) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 16, top: 4, bottom: 0 }}
          barCategoryGap={14}
        >
          {/* Sin CartesianGrid ni eje numérico: la etiqueta sobre la barra basta. */}
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            axisLine={false}
            tickLine={false}
            width={104}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))', radius: 16 }}
            content={(props) => <SoftTooltip {...props} />}
          />
          <Bar dataKey="amount" radius={[16, 16, 16, 16]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={TONES[i % TONES.length]} />
            ))}
            <LabelList
              dataKey="amount"
              position="right"
              formatter={(v) => formatMoneyCompact(Number(v))}
              className="tnum"
              fill="hsl(var(--muted-foreground))"
              fontSize={11}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Tooltip suave y redondeado, no el default crudo de Recharts.
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
