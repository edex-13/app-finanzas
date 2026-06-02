import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  PiggyBank,
  Settings as SettingsIcon,
  Wallet,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { useFinancialSnapshot } from '@/hooks/useFinancialSnapshot'
import { useProjection } from '@/hooks/useProjection'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useDebts, useDebtInstallments } from '@/features/debts/hooks'
import { useRecurringTransactions } from '@/features/transactions/hooks'
import { useSalaryPeriods } from '@/features/income/hooks'
import { useSettings } from '@/features/settings/hooks'
import { daysFromToday, formatDateShort } from '@/lib/date-utils'
import { formatMoney } from '@/lib/format'
import {
  calculateProjectedBalance,
  calculateUpcomingPayments,
  calculateUpcomingIncome,
  calculateSafeSpendingCapacity,
} from '@/lib/financial-calculations'
import type { UpcomingPayment, UpcomingPaymentStatus } from '@/types/domain'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'

// Tonos pastel apagados para las barras de deuda por origen (rota por índice).
const BAR_TONES = ['#c98a7d', '#c9a24b', '#9ca37e', '#a6bfd0', '#d9aeb8', '#b7aed0']

const statusLabel: Record<UpcomingPaymentStatus, string> = {
  overdue: 'Vencido',
  today: 'Hoy',
  soon: 'Pronto',
  scheduled: 'Programado',
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

  const soonWindow = settings?.alert_days_before_payment ?? 3

  const hasAccounts = (accounts.data?.length ?? 0) > 0
  const hasCards = (cards.data?.length ?? 0) > 0
  const hasIncome = (salary.data?.length ?? 0) > 0
  const hasAnyData =
    hasAccounts || hasCards || (debts.data?.filter((d) => !d.archived).length ?? 0) > 0

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

  const nextPayment = upcomingPayments[0]
  const upcomingIncomeTotal = upcomingIncome.reduce((a, i) => a + i.amount, 0)

  const safeSpending = useMemo(
    () =>
      calculateSafeSpendingCapacity({
        available: snap.data.totalAvailable,
        upcomingPayments,
      }),
    [snap.data.totalAvailable, upcomingPayments],
  )

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
    return out.sort((a, b) => b.amount - a.amount).slice(0, 4)
  }, [debts.data, cards.data])

  const maxDebt = debtsByOrigin[0]?.amount ?? 0

  return (
    <div className="space-y-8">
      {/* Encabezado mínimo: solo un acceso a ajustes, como en la referencia */}
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
          <Link to={paths.settings} aria-label="Ajustes">
            <SettingsIcon className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      {/* Número héroe: patrimonio líquido enorme */}
      <Hero
        netWorth={snap.data.liquidNetWorth}
        available={snap.data.totalAvailable}
        debt={snap.data.totalDebt}
        loading={snap.isLoading}
      />

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

      {/* KPIs como píldoras */}
      <MotionList className="flex flex-wrap gap-2.5">
        <MotionItem>
          <Stat label="Disponible" value={snap.data.totalAvailable} loading={snap.isLoading} />
        </MotionItem>
        <MotionItem>
          <Stat
            label="Gasto seguro"
            value={safeSpending}
            loading={snap.isLoading}
            tone={safeSpending <= 0 ? 'destructive' : 'success'}
          />
        </MotionItem>
        <MotionItem>
          <Stat
            label="Próximo pago"
            value={nextPayment?.amount ?? 0}
            loading={snap.isLoading}
            tone={nextPayment?.status === 'overdue' ? 'destructive' : undefined}
            hint={nextPayment ? formatDateShort(nextPayment.date) : 'Ninguno'}
          />
        </MotionItem>
      </MotionList>

      {/* Barras pastel: deuda por origen */}
      {debtsByOrigin.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-extrabold tracking-tight">Deuda por origen</h2>
          <div className="flex items-end gap-3" style={{ height: 200 }}>
            {debtsByOrigin.map((d, i) => {
              const pct = maxDebt > 0 ? Math.max(d.amount / maxDebt, 0.12) : 0
              const tone = BAR_TONES[i % BAR_TONES.length]
              return (
                <div key={d.name + i} className="flex min-w-0 flex-1 flex-col justify-end">
                  <div
                    className="flex flex-col justify-end rounded-3xl px-3 pb-3 pt-4"
                    style={{ backgroundColor: tone, height: `${pct * 100}%`, minHeight: 64 }}
                  >
                    <p className="truncate text-xs font-bold text-black/70">{shortMoney(d.amount)}</p>
                  </div>
                  <p className="mt-2 truncate text-center text-[11px] text-muted-foreground">
                    {d.name}
                  </p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Próximos eventos */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-extrabold tracking-tight">Próximos 30 días</h2>
        </div>

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

      {/* Saldo proyectado: tres cifras grandes, sin gráfica pesada */}
      <section className="space-y-4">
        <h2 className="text-xl font-extrabold tracking-tight">Saldo proyectado</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <Projected label="30d" value={projected.d30} start={projection.startBalance} loading={projection.isLoading} />
          <Projected label="60d" value={projected.d60} start={projection.startBalance} loading={projection.isLoading} />
          <Projected label="90d" value={projected.d90} start={projection.startBalance} loading={projection.isLoading} />
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
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-lg font-black text-primary-foreground">
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
          <span className="h-2 w-2 rounded-full bg-primary" />
          <MoneyDisplay value={debt} className="tnum" /> deuda
        </span>
      </div>
    </div>
  )
}

/* ── Píldora de KPI ─────────────────────────────────────────── */
function Stat({
  label,
  value,
  loading,
  tone,
  hint,
}: {
  label: string
  value: number
  loading?: boolean
  tone?: 'destructive' | 'success'
  hint?: string
}) {
  return (
    <div className="rounded-3xl bg-card px-4 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <MoneyDisplay
          value={value}
          className={cn(
            'block text-lg font-extrabold tnum',
            tone === 'destructive' && 'text-destructive',
            tone === 'success' && 'text-success',
          )}
        />
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
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

/* Formato compacto para etiquetas dentro de las barras: 2M, 1,5M, 796k */
function shortMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const v = n / 1_000_000
    return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}M`
  }
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`
  return formatMoney(n)
}
