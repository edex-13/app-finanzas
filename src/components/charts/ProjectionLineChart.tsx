import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
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
  // Si el saldo llega a negativo en algún punto, la línea se tiñe de coral (alerta).
  const hasNegative = data.some((d) => d.balance < 0)
  const accent = hasNegative ? 'hsl(var(--destructive))' : 'hsl(var(--pastel-blue))'

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            {/* Relleno pastel translúcido, sin degradado de marca. */}
            <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.18} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Sin CartesianGrid: aire limpio estilo MonAi. */}
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDayTick(v)}
            axisLine={false}
            tickLine={false}
            minTickGap={48}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            dy={6}
          />
          <YAxis
            tickFormatter={(v) => formatMoneyCompact(v)}
            axisLine={false}
            tickLine={false}
            width={52}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
            content={(props) => <SoftTooltip {...props} />}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={accent}
            strokeWidth={2.5}
            fill="url(#balFill)"
            dot={false}
            activeDot={{
              r: 5,
              fill: accent,
              stroke: 'hsl(var(--card))',
              strokeWidth: 3,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// Tooltip suave y redondeado, no el default crudo de Recharts.
function SoftTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0].value)
  const negative = value < 0
  return (
    <div className="rounded-2xl bg-card px-3.5 py-2.5 shadow-soft">
      <p className="text-[11px] text-muted-foreground">{formatDayLabel(String(label))}</p>
      <p
        className={`tnum text-sm font-extrabold ${negative ? 'text-destructive' : 'text-foreground'}`}
      >
        {formatMoney(value)}
      </p>
    </div>
  )
}

function formatDayTick(iso: string) {
  // "MM-DD" -> "DD/MM" compacto para el eje.
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function formatDayLabel(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
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
