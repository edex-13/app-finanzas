import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { addDays, toISODate, today } from '@/lib/date-utils'
import { formatMoneyCompact, formatMoney } from '@/lib/format'
import type { ProjectedEvent } from '@/types/domain'

interface Props {
  events: ProjectedEvent[]
  startBalance: number
  horizonDays: number
}

export function ProjectionLineChart({
  events,
  startBalance,
  horizonDays,
}: Props) {
  const data = buildDailySeries(events, startBalance, horizonDays)
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => v.slice(5)}
            fontSize={11}
            stroke="hsl(var(--muted-foreground))"
          />
          <YAxis
            tickFormatter={(v) => formatMoneyCompact(v)}
            fontSize={11}
            width={60}
            stroke="hsl(var(--muted-foreground))"
          />
          <Tooltip
            formatter={(v) => formatMoney(Number(v))}
            labelFormatter={(l) => String(l)}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--popover))',
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#balGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function buildDailySeries(
  events: ProjectedEvent[],
  startBalance: number,
  horizonDays: number,
) {
  const start = today()
  const days: { date: string; balance: number }[] = []
  let cursor = startBalance
  let ei = 0
  for (let d = 0; d <= horizonDays; d += 1) {
    const dateISO = toISODate(addDays(start, d))
    while (ei < events.length && events[ei].date <= dateISO) {
      cursor = events[ei].runningBalance
      ei += 1
    }
    days.push({ date: dateISO, balance: cursor })
  }
  return days
}
