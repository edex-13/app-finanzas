import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  CreditCard,
  PiggyBank,
  Sparkles,
  Wallet,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { CategorySpendChart } from '@/components/charts/CategorySpendChart'
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart'
import { ProjectionLineChart } from '@/components/charts/ProjectionLineChart'
import { DebtsBarChart } from '@/components/charts/DebtsBarChart'
import { useFinancialSnapshot } from '@/hooks/useFinancialSnapshot'
import { useProjection } from '@/hooks/useProjection'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useDebts, useDebtInstallments } from '@/features/debts/hooks'
import {
  useRecurringTransactions,
  useTransactions,
  useCategories,
} from '@/features/transactions/hooks'
import { useSalaryPeriods } from '@/features/income/hooks'
import { useSettings } from '@/features/settings/hooks'
import {
  daysFromToday,
  formatDateShort,
  formatMonthYear,
  toISODate,
  today,
} from '@/lib/date-utils'
import { formatMoney, formatMoneyCompact } from '@/lib/format'
import { categoryIcon, categoryTint } from '@/lib/category-visual'
import {
  aggregateSpendingByCategory,
  calculateFinancialHealth,
  calculateProjectedBalance,
  calculateUpcomingPayments,
  calculateUpcomingIncome,
  sumIncomeVsExpense,
} from '@/lib/financial-calculations'
import type { FinancialHealth } from '@/lib/financial-calculations'
import type { UpcomingPayment, UpcomingPaymentStatus } from '@/types/domain'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'

const statusLabel: Record<UpcomingPaymentStatus, string> = {
  overdue: 'Vencido',
  today: 'Hoy',
  soon: 'Pronto',
  scheduled: 'Programado',
}

// Semáforo pastel para la salud financiera: cada etiqueta tiene su tono.
const healthTone: Record<FinancialHealth['label'], string> = {
  excelente: 'hsl(var(--pastel-mint))',
  buena: 'hsl(var(--pastel-blue))',
  regular: 'hsl(var(--pastel-sand))',
  frágil: 'hsl(var(--destructive))',
}

export function DashboardPage() {
  const snap = useFinancialSnapshot()
  const projection = useProjection({ horizonDays: 90 })
  const accounts = useAccounts()
  const cards = useCreditCards()
  const debts = useDebts()
  const installments = useDebtInstallments()
  const recurring = useRecurringTransactions()
  const salary = useSalaryPeriods()
  const { data: settings } = useSettings()

  // Rango del mes actual (para gasto por categoría e ingresos vs gastos).
  const monthRange = useMemo(() => {
    const now = today()
    const from = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
    const to = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    return { from, to, label: formatMonthYear(now) }
  }, [])

  const transactions = useTransactions({ from: monthRange.from, to: monthRange.to })
  const categories = useCategories()

  const soonWindow = settings?.alert_days_before_payment ?? 3

  const hasAccounts = (accounts.data?.length ?? 0) > 0
  const hasCards = (cards.data?.length ?? 0) > 0
  const hasIncome = (salary.data?.length ?? 0) > 0
  const hasAnyData =
    hasAccounts || hasCards || (debts.data?.filter((d) => !d.archived).length ?? 0) > 0

  // Ingresos vs gastos del mes (reales).
  const flow = useMemo(
    () =>
      sumIncomeVsExpense(transactions.data ?? [], {
        from: monthRange.from,
        to: monthRange.to,
      }),
    [transactions.data, monthRange],
  )

  // Gasto por categoría del mes con colores reales.
  const spendByCategory = useMemo(
    () =>
      aggregateSpendingByCategory(
        transactions.data ?? [],
        categories.data ?? [],
        { from: monthRange.from, to: monthRange.to, limit: 8 },
      ),
    [transactions.data, categories.data, monthRange],
  )
  const totalSpend = useMemo(
    () => spendByCategory.reduce((a, c) => a + c.amount, 0),
    [spendByCategory],
  )

  // Salud financiera (semáforo + chips).
  const health = useMemo(
    () =>
      calculateFinancialHealth({
        totalAvailable: snap.data.totalAvailable,
        totalDebt: snap.data.totalDebt,
        netWorth: snap.data.liquidNetWorth,
        cards: (cards.data ?? []).map((c) => ({
          credit_limit: Number(c.credit_limit),
          current_debt: Number(c.current_debt),
          archived: c.archived,
        })),
        periodIncome: flow.income,
        periodExpense: flow.expense,
      }),
    [snap.data, cards.data, flow.income, flow.expense],
  )

  const projected = useMemo(
    () => ({
      d30: calculateProjectedBalance(projection.events, projection.startBalance, 30),
      d60: calculateProjectedBalance(projection.events, projection.startBalance, 60),
      d90: calculateProjectedBalance(projection.events, projection.startBalance, 90),
    }),
    [projection.events, projection.startBalance],
  )

  const upcomingPayments = useMemo<UpcomingPayment[]>(
    () =>
      calculateUpcomingPayments(
        {
          installments: installments.data ?? [],
          debts: debts.data ?? [],
          cards: cards.data ?? [],
          recurring: recurring.data ?? [],
        },
        { horizonDays: 30, soonWindow, limit: 8 },
      ),
    [installments.data, debts.data, cards.data, recurring.data, soonWindow],
  )

  const upcomingIncome = useMemo(
    () =>
      calculateUpcomingIncome(
        { salaryPeriods: salary.data ?? [], recurring: recurring.data ?? [] },
        { horizonDays: 30, limit: 5 },
      ),
    [salary.data, recurring.data],
  )

  const upcomingIncomeTotal = upcomingIncome.reduce((a, i) => a + i.amount, 0)

  // Deuda por origen (alimenta DebtsBarChart).
  const debtsByOrigin = useMemo(() => {
    const out: { name: string; amount: number }[] = []
    for (const d of debts.data ?? []) {
      if (!d.archived && d.remaining_balance > 0)
        out.push({ name: d.name, amount: Number(d.remaining_balance) })
    }
    for (const c of cards.data ?? []) {
      if (!c.archived && c.current_debt > 0)
        out.push({ name: c.name, amount: Number(c.current_debt) })
    }
    return out.sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [debts.data, cards.data])

  const greeting = useMemo(() => getGreeting(), [])

  return (
    <div className="space-y-8">
      {/* Encabezado limpio: saludo cálido, sin botón de Ajustes (vive en la barra). */}
      <p className="text-sm font-bold text-muted-foreground">{greeting}</p>

      {/* Número héroe: patrimonio líquido enorme */}
      <Hero
        netWorth={snap.data.liquidNetWorth}
        available={snap.data.totalAvailable}
        debt={snap.data.totalDebt}
        loading={snap.isLoading}
      />

      {/* Acceso rápido a Simular: promesa de valor, siempre a un toque */}
      <Link
        to={paths.simulator}
        className="flex items-center gap-3 rounded-3xl bg-primary px-5 py-4 text-primary-foreground shadow-soft transition-transform active:scale-[0.98]"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">¿Puedes comprarlo?</span>
          <span className="block text-xs text-primary-foreground/80">
            Simula una compra antes de gastar
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 opacity-80" />
      </Link>

      {!hasAnyData && !snap.isLoading && (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="Empieza a construir tu panorama"
          description="Crea tu primera cuenta para ver tu dinero, deudas y proyecciones en un solo lugar."
          action={
            <Button asChild>
              <Link to={paths.accounts}>Crear mi primera cuenta</Link>
            </Button>
          }
        />
      )}

      {/* Medidor de salud financiera */}
      {hasAnyData && !snap.isLoading && (
        <HealthMeter health={health} />
      )}

      {/* Ingresos vs gastos del mes */}
      {hasAnyData && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-extrabold tracking-tight">Ingresos vs gastos</h2>
            <span className="text-xs font-semibold capitalize text-muted-foreground">
              {monthRange.label}
            </span>
          </div>
          <div className="rounded-3xl bg-card p-4">
            <IncomeExpenseChart income={flow.income} expense={flow.expense} />
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-sm font-bold text-muted-foreground">Neto del mes</span>
              <MoneyDisplay
                value={flow.net}
                showSign
                className={cn(
                  'tnum text-lg font-extrabold',
                  flow.net >= 0 ? 'text-success' : 'text-destructive',
                )}
              />
            </div>
          </div>
        </section>
      )}

      {/* Gasto por categoría: dona con colores reales + desglose en filas-píldora */}
      {totalSpend > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight">¿En qué gastas?</h2>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
            <div className="rounded-3xl bg-card p-4">
              <CategorySpendChart data={spendByCategory} total={totalSpend} />
            </div>
            <div className="space-y-2">
              {spendByCategory.slice(0, 5).map((c) => {
                const Icon = categoryIcon(c.icon)
                return (
                  <div
                    key={c.categoryId ?? 'none'}
                    className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3"
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                      style={categoryTint(c.color)}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {Math.round(c.share * 100)}% del gasto
                      </p>
                    </div>
                    <MoneyDisplay
                      value={c.amount}
                      className="tnum shrink-0 text-sm font-extrabold"
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* KPIs como píldoras */}
      <MotionList className="grid grid-cols-3 gap-2.5">
        <MotionItem>
          <Stat label="Disponible" value={snap.data.totalAvailable} loading={snap.isLoading} />
        </MotionItem>
        <MotionItem>
          <Stat
            label="Deuda total"
            value={snap.data.totalDebt}
            loading={snap.isLoading}
            tone={snap.data.totalDebt > 0 ? 'destructive' : undefined}
          />
        </MotionItem>
        <MotionItem>
          <Stat
            label="Cupo libre"
            value={snap.data.totalCreditAvailable}
            loading={snap.isLoading}
            tone="success"
          />
        </MotionItem>
      </MotionList>

      {/* Saldo proyectado: gráfica de línea + tres cifras grandes */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold tracking-tight">Saldo proyectado</h2>
        <div className="rounded-3xl bg-card p-4">
          {projection.isLoading ? (
            <Skeleton className="h-[260px] w-full rounded-2xl" />
          ) : (
            <ProjectionLineChart
              events={projection.events}
              startBalance={projection.startBalance}
              horizonDays={90}
            />
          )}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <Projected label="30d" value={projected.d30} start={projection.startBalance} loading={projection.isLoading} />
          <Projected label="60d" value={projected.d60} start={projection.startBalance} loading={projection.isLoading} />
          <Projected label="90d" value={projected.d90} start={projection.startBalance} loading={projection.isLoading} />
        </div>
      </section>

      {/* Deuda por origen */}
      {debtsByOrigin.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight">Deuda por origen</h2>
          <div className="rounded-3xl bg-card p-4">
            <DebtsBarChart data={debtsByOrigin} />
          </div>
        </section>
      )}

      {/* Próximos eventos */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold tracking-tight">Próximos 30 días</h2>

        {/* Ingresos */}
        <div className="space-y-2">
          <Row
            kind="header"
            icon={<ArrowUpRight className="h-3.5 w-3.5" />}
            label="Ingresos"
            amount={upcomingIncomeTotal}
            positive
          />
          {upcomingIncome.length === 0 ? (
            <Empty>Sin ingresos próximos.</Empty>
          ) : (
            upcomingIncome.slice(0, 3).map((i, idx) => (
              <Row key={idx} label={i.label} date={i.date} amount={i.amount} positive />
            ))
          )}
        </div>

        {/* Pagos */}
        <div className="space-y-2">
          <Row
            kind="header"
            icon={<ArrowDownRight className="h-3.5 w-3.5" />}
            label="Pagos"
          />
          {upcomingPayments.length === 0 ? (
            <Empty>Sin pagos próximos. 🎉</Empty>
          ) : (
            upcomingPayments
              .slice(0, 5)
              .map((p, idx) => (
                <Row key={idx} label={p.label} date={p.date} amount={p.amount} status={p.status} />
              ))
          )}
        </div>
      </section>

      {/* Sugerencias de configuración */}
      {hasAnyData && !snap.isLoading && (!hasCards || !hasIncome || !hasAccounts) && (
        <section className="space-y-2.5">
          {!hasCards && (
            <SetupHint
              icon={<CreditCard className="h-5 w-5" />}
              title="Agrega una tarjeta"
              description="Controla cupos, cortes y pagos."
              to={paths.cards}
            />
          )}
          {!hasIncome && (
            <SetupHint
              icon={<Banknote className="h-5 w-5" />}
              title="Configura tus ingresos"
              description="Mejora la precisión de tus proyecciones."
              to={paths.income}
            />
          )}
          {!hasAccounts && (
            <SetupHint
              icon={<PiggyBank className="h-5 w-5" />}
              title="Crea una cuenta"
              description="Registra dónde guardas tu dinero."
              to={paths.accounts}
            />
          )}
        </section>
      )}
    </div>
  )
}

/* ── Saludo según la hora ───────────────────────────────────── */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días 👋'
  if (h < 19) return 'Buenas tardes 👋'
  return 'Buenas noches 👋'
}

/* ── Número héroe ───────────────────────────────────────────── */
function Hero({
  netWorth,
  available,
  debt,
  loading,
}: {
  netWorth: number
  available: number
  debt: number
  loading?: boolean
}) {
  const isNeg = netWorth < 0
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-muted-foreground">Patrimonio líquido</p>
      {loading ? (
        <Skeleton className="h-16 w-3/4" />
      ) : (
        <div className="flex items-baseline gap-1">
          {isNeg && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-destructive text-lg font-black text-destructive-foreground">
              –
            </span>
          )}
          <span className="text-hero text-5xl sm:text-6xl">{formatMoney(Math.abs(netWorth))}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-bold">
          <span className="h-2 w-2 rounded-full bg-pastel-mint" />
          <MoneyDisplay value={available} className="tnum" /> disponible
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-bold">
          <span className="h-2 w-2 rounded-full bg-destructive" />
          <MoneyDisplay value={debt} className="tnum" /> deuda
        </span>
      </div>
    </div>
  )
}

/* ── Medidor de salud financiera ────────────────────────────── */
function HealthMeter({ health }: { health: FinancialHealth }) {
  const tone = healthTone[health.label]
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-extrabold tracking-tight">Salud financiera</h2>
      <div className="rounded-3xl bg-card p-5">
        <div className="flex items-center gap-4">
          {/* Marcador circular con el puntaje */}
          <div
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: tone }}
          >
            <span className="tnum text-2xl font-black text-black/75">{health.score}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Estado
            </p>
            <p className="text-2xl font-extrabold capitalize" style={{ color: tone }}>
              {health.label}
            </p>
            <p className="text-[11px] text-muted-foreground">Puntaje sobre 100</p>
          </div>
        </div>

        {/* Barra de progreso del puntaje */}
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full"
            style={{ width: `${health.score}%`, backgroundColor: tone }}
          />
        </div>

        {/* Chips de detalle */}
        <div className="mt-4 flex flex-wrap gap-2">
          <HealthChip label="Deuda" value={`${Math.round(health.debtRatio * 100)}%`} />
          <HealthChip label="Uso tarjetas" value={`${Math.round(health.avgCardUtilization * 100)}%`} />
          <HealthChip
            label="Ahorro"
            value={`${Math.round(health.savingsRate * 100)}%`}
            negative={health.savingsRate < 0}
          />
        </div>
      </div>
    </section>
  )
}

function HealthChip({
  label,
  value,
  negative,
}: {
  label: string
  value: string
  negative?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-bold">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tnum', negative && 'text-destructive')}>{value}</span>
    </span>
  )
}

/* ── Píldora de KPI ─────────────────────────────────────────── */
function Stat({
  label,
  value,
  loading,
  tone,
}: {
  label: string
  value: number
  loading?: boolean
  tone?: 'destructive' | 'success'
}) {
  return (
    <div className="rounded-3xl bg-card px-4 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-16" />
      ) : (
        <span
          className={cn(
            'block text-base font-extrabold tnum',
            tone === 'destructive' && 'text-destructive',
            tone === 'success' && 'text-success',
          )}
        >
          {formatMoneyCompact(value)}
        </span>
      )}
    </div>
  )
}

/* ── Fila de evento (píldora) ───────────────────────────────── */
function Row({
  kind,
  icon,
  label,
  date,
  amount,
  status,
  positive,
}: {
  kind?: 'header'
  icon?: React.ReactNode
  label: string
  date?: string
  amount?: number
  status?: UpcomingPaymentStatus
  positive?: boolean
}) {
  if (kind === 'header') {
    return (
      <div className="flex items-center justify-between px-1">
        <span
          className={cn(
            'flex items-center gap-1.5 text-sm font-bold',
            positive ? 'text-success' : 'text-foreground/80',
          )}
        >
          {icon} {label}
        </span>
        {amount !== undefined && (
          <MoneyDisplay
            value={amount}
            className={cn('tnum text-sm font-bold', positive && 'text-success')}
          />
        )}
      </div>
    )
  }

  const days = date ? daysFromToday(date) : 0
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{label}</p>
        {date && (
          <p className="text-[11px] text-muted-foreground">
            {formatDateShort(date)} · {days === 0 ? 'hoy' : days < 0 ? `hace ${-days}d` : `en ${days}d`}
            {status && status !== 'scheduled' ? ` · ${statusLabel[status]}` : ''}
          </p>
        )}
      </div>
      {amount !== undefined && (
        <MoneyDisplay
          value={amount}
          className={cn('tnum shrink-0 text-sm font-extrabold', positive && 'text-success')}
        />
      )}
    </div>
  )
}

function Projected({
  label,
  value,
  start,
  loading,
}: {
  label: string
  value: number
  start: number
  loading?: boolean
}) {
  const delta = value - start
  const up = delta >= 0
  return (
    <div className="rounded-3xl bg-card px-3 py-4 text-center">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mx-auto mt-1.5 h-5 w-16" />
      ) : (
        <>
          <MoneyDisplay value={value} className="mt-1 block text-base font-extrabold tnum" />
          <MoneyDisplay
            value={delta}
            showSign
            className={cn('mt-0.5 block text-[11px] font-bold tnum', up ? 'text-success' : 'text-destructive')}
          />
        </>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 text-xs text-muted-foreground">{children}</p>
}

function SetupHint({
  icon,
  title,
  description,
  to,
}: {
  icon: React.ReactNode
  title: string
  description: string
  to: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl bg-card p-4 transition-colors hover:bg-accent"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  )
}
