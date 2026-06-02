import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney, formatMoneyCompact } from '@/lib/format'

interface DebtPoint {
  name: string
  amount: number
}

interface Props {
  data: DebtPoint[]
}

export function DebtsBarChart({ data }: Props) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            type="number"
            tickFormatter={(v) => formatMoneyCompact(v)}
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={110}
          />
          <Tooltip
            formatter={(v) => formatMoney(Number(v))}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="amount"
            fill="hsl(var(--primary))"
            radius={[4, 4, 4, 4]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
