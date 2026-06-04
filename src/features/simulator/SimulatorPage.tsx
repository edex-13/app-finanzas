import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MoneyInput } from '@/components/common/MoneyInput'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { simulationSchema, type SimulationInput } from '@/lib/validations'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useFinancialSnapshot } from '@/hooks/useFinancialSnapshot'
import { useCreateTransaction } from '@/features/transactions/hooks'
import {
  simulateCashPurchase,
  simulateCreditCardPurchase,
  recommendBestPaymentMethod,
  calculateCardCutoffImpact,
  type PurchaseRisk,
  type PurchaseVerdict,
} from '@/lib/financial-calculations'
import { fromISODate, toISODate, today, formatDateShort } from '@/lib/date-utils'
import { usePurchaseSimulations, useSaveSimulation } from './hooks'

type PaymentOption = SimulationInput['payment_option']

const riskLabel: Record<PurchaseRisk, string> = {
  low: 'Riesgo bajo',
  medium: 'Riesgo medio',
  high: 'Riesgo alto',
}
const verdictLabel: Record<PurchaseVerdict, string> = {
  buy: 'Puedes comprarlo',
  wait: 'Mejor espera',
  cannot: 'No deberías comprarlo ahora',
}

/** Chip pastel apagado para el nivel de riesgo (texto oscuro sobre pastel). */
const riskChip: Record<PurchaseRisk, string> = {
  low: 'bg-pastel-mint text-black/70',
  medium: 'bg-pastel-sand text-black/70',
  high: 'bg-destructive text-destructive-foreground',
}

/** Bloque-semáforo del veredicto: pastel/coral según resultado. */
const verdictBlock: Record<PurchaseVerdict, string> = {
  buy: 'bg-pastel-mint text-black/80',
  wait: 'bg-pastel-sand text-black/80',
  cannot: 'bg-destructive text-destructive-foreground',
}

const verdictEmoji: Record<PurchaseVerdict, string> = {
  buy: '✅',
  wait: '⏳',
  cannot: '🚫',
}

export function SimulatorPage() {
  const accounts = useAccounts()
  const cards = useCreditCards()
  const snap = useFinancialSnapshot()
  const sims = usePurchaseSimulations()
  const save = useSaveSimulation()
  const createTx = useCreateTransaction()
  const [submitted, setSubmitted] = useState<SimulationInput | null>(null)

  const form = useForm<SimulationInput>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      input_amount: 0,
      simulation_date: toISODate(today()),
      payment_option: 'cash',
      selected_account_id: null,
      selected_card_id: null,
      necessary: true,
      installments_count: 1,
    },
  })

  // Colchón de emergencia simple: 10% del disponible (heurística v1).
  const emergencyMinimum = useMemo(
    () => Math.round(snap.data.totalAvailable * 0.1),
    [snap.data.totalAvailable],
  )

  const result = useMemo(() => {
    const values = submitted
    if (!values) return null
    const amount = values.input_amount
    const date = fromISODate(values.simulation_date)
    const allCards = cards.data ?? []
    const allAccounts = accounts.data ?? []

    // Recomendación global (mejor medio + comprar/esperar + riesgo).
    const recommendation = recommendBestPaymentMethod({
      amount,
      totalAvailable: snap.data.totalAvailable,
      accounts: allAccounts,
      cards: allCards,
      necessary: values.necessary,
      emergencyMinimum,
      purchaseDate: date,
    })

    if (values.payment_option === 'cash') {
      const sim = simulateCashPurchase({
        amount,
        availableBalance: snap.data.totalAvailable,
        emergencyMinimum,
      })
      return {
        kind: 'cash' as const,
        ok: sim.canAfford,
        risk: sim.risk,
        verdict: recommendation.verdict,
        title: sim.canAfford ? 'Sí puedes pagarlo en efectivo' : 'No alcanza tu efectivo',
        message: `Disponible: ${fmt(snap.data.totalAvailable)}. Quedaría ${fmt(sim.balanceAfter)}.`,
        balanceAfter: sim.balanceAfter,
        recommendation,
        suggestedCardId: null as string | null,
      }
    }

    if (values.payment_option === 'account') {
      const acc = allAccounts.find((a) => a.id === values.selected_account_id)
      if (!acc) {
        return {
          kind: 'account' as const,
          ok: false,
          risk: 'high' as PurchaseRisk,
          verdict: 'cannot' as PurchaseVerdict,
          title: 'Elige una cuenta',
          message: 'Selecciona la cuenta con la que pagarías.',
          recommendation,
          suggestedCardId: null,
        }
      }
      const sim = simulateCashPurchase({
        amount,
        availableBalance: Number(acc.balance),
        emergencyMinimum,
      })
      return {
        kind: 'account' as const,
        ok: sim.canAfford,
        risk: sim.risk,
        verdict: recommendation.verdict,
        title: sim.canAfford
          ? `Sí puedes pagarlo desde ${acc.name}`
          : `No alcanza el saldo en ${acc.name}`,
        message: `Saldo: ${fmt(Number(acc.balance))}. Quedaría ${fmt(sim.balanceAfter)}.`,
        balanceAfter: sim.balanceAfter,
        recommendation,
        suggestedCardId: null,
      }
    }

    // Tarjeta: usa la específica si se eligió; si no, la mejor tarjeta del ranking.
    const chosenCard =
      allCards.find((c) => c.id === values.selected_card_id) ??
      allCards.find(
        (c) => c.id === recommendation.ranked.find((o) => o.method === 'card')?.refId,
      )
    if (!chosenCard) {
      return {
        kind: 'card' as const,
        ok: false,
        risk: 'high' as PurchaseRisk,
        verdict: 'cannot' as PurchaseVerdict,
        title: 'Sin tarjeta disponible',
        message: 'No tienes tarjetas registradas.',
        recommendation,
        suggestedCardId: null,
      }
    }
    const sim = simulateCreditCardPurchase({ amount, card: chosenCard, purchaseDate: date })
    const cutoff = calculateCardCutoffImpact(chosenCard, date)
    return {
      kind: 'card' as const,
      ok: sim.canAfford,
      risk: sim.risk,
      verdict: recommendation.verdict,
      title: sim.canAfford
        ? `Paga con ${chosenCard.name}`
        : `${chosenCard.name} no tiene cupo`,
      message: sim.reason,
      suggestedCardId: chosenCard.id,
      availableAfter: sim.availableAfter,
      utilizationAfter: sim.utilizationAfter,
      interestFreeDays: cutoff.interestFreeDays,
      realPaymentDate: sim.realPaymentDate,
      recommendation,
    }
  }, [submitted, snap.data, accounts.data, cards.data, emergencyMinimum])

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitted(values)
    try {
      await save.mutateAsync({
        input_amount: values.input_amount,
        simulation_date: values.simulation_date,
        payment_option: values.payment_option,
        selected_account_id: values.selected_account_id ?? null,
        selected_card_id: values.selected_card_id ?? null,
        suggested_card_id: null,
        can_afford: false, // se recalcula al render; valor informativo
        impact_json: { necessary: values.necessary ?? true },
        note: values.note ?? null,
      })
    } catch (e) {
      toast.error((e as Error).message ?? 'Error guardando simulación')
    }
  })

  // Convierte la simulación actual en una transacción real (gasto).
  const convertToTransaction = async () => {
    if (!submitted || !result) return
    const v = submitted
    try {
      if (v.payment_option === 'card') {
        await createTx.mutateAsync({
          date: v.simulation_date,
          amount: v.input_amount,
          kind: 'expense',
          credit_card_id: result.suggestedCardId,
          account_id: null,
          counterparty_account_id: null,
          category_id: null,
          debt_id: null,
          debt_installment_id: null,
          note: v.note || 'Compra simulada',
          installments_count:
            (v.installments_count ?? 1) > 1 ? v.installments_count : null,
        })
      } else {
        const accountId =
          v.payment_option === 'account'
            ? v.selected_account_id ?? null
            : accounts.data?.find((a) => !a.archived)?.id ?? null
        await createTx.mutateAsync({
          date: v.simulation_date,
          amount: v.input_amount,
          kind: 'expense',
          account_id: accountId,
          counterparty_account_id: null,
          credit_card_id: null,
          category_id: null,
          debt_id: null,
          debt_installment_id: null,
          note: v.note || 'Compra simulada',
        })
      }
      toast.success('Transacción registrada')
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo convertir')
    }
  }

  const paymentOption = form.watch('payment_option') as PaymentOption
  const necessary = form.watch('necessary')
  const installmentsCount = form.watch('installments_count')
  const inputAmount = form.watch('input_amount')

  const paymentChips: { v: PaymentOption; l: string; emoji: string }[] = [
    { v: 'cash', l: 'Efectivo', emoji: '💵' },
    { v: 'account', l: 'Cuenta', emoji: '🏦' },
    { v: 'card', l: 'Tarjeta', emoji: '💳' },
  ]

  // Píldora suave para selects/inputs (sin borde duro).
  const pillField =
    'h-12 w-full rounded-2xl border-0 bg-secondary px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring/40'

  return (
    <div className="space-y-8">
      <PageHeader
        title="Simulador de compra"
        description="¿Puedes comprarlo? Te decimos el impacto y la mejor forma de pago."
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ---------- Formulario ---------- */}
        <form className="space-y-6" onSubmit={onSubmit} noValidate>
          {/* Valor de la compra — número protagonista */}
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-muted-foreground">
              Valor de la compra
            </p>
            <MoneyInput
              value={inputAmount}
              onChange={(v) =>
                form.setValue('input_amount', v, { shouldValidate: true })
              }
              className="h-auto border-0 bg-transparent p-0 text-hero text-4xl text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-5xl"
            />
            {form.formState.errors.input_amount?.message && (
              <p className="text-xs text-destructive">
                {form.formState.errors.input_amount.message}
              </p>
            )}
          </div>

          {/* Forma de pago — chips seleccionables */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">
              Forma de pago
            </p>
            <div className="grid grid-cols-3 gap-2">
              {paymentChips.map((o) => {
                const active = paymentOption === o.v
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => form.setValue('payment_option', o.v)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-bold transition-all active:scale-[0.97]',
                      active
                        ? 'bg-foreground text-background'
                        : 'bg-secondary text-foreground',
                    )}
                  >
                    <span aria-hidden>{o.emoji}</span>
                    {o.l}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ¿Necesaria? — píldora con switch */}
          <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3.5">
            <span className="text-sm font-bold">¿Es una compra necesaria?</span>
            <Switch
              checked={!!necessary}
              onCheckedChange={(v) => form.setValue('necessary', v)}
            />
          </div>

          {/* Fecha */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">
              Fecha de la compra
            </p>
            <input
              id="simulation_date"
              type="date"
              {...form.register('simulation_date')}
              className={pillField}
            />
            {form.formState.errors.simulation_date?.message && (
              <p className="text-xs text-destructive">
                {form.formState.errors.simulation_date.message}
              </p>
            )}
          </div>

          {/* Cuenta */}
          {paymentOption === 'account' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">Cuenta</p>
              <Select
                value={form.watch('selected_account_id') ?? ''}
                onValueChange={(v) =>
                  form.setValue('selected_account_id', v || null)
                }
              >
                <SelectTrigger className={pillField}>
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Tarjeta + cuotas */}
          {paymentOption === 'card' && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">
                  Tarjeta (vacío = mejor sugerida)
                </p>
                <Select
                  value={form.watch('selected_card_id') ?? '__auto'}
                  onValueChange={(v) =>
                    form.setValue('selected_card_id', v === '__auto' ? null : v)
                  }
                >
                  <SelectTrigger className={pillField}>
                    <SelectValue placeholder="Mejor sugerida" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto">Mejor sugerida</SelectItem>
                    {(cards.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">
                  Cuotas (1 = sin diferir)
                </p>
                <input
                  type="number"
                  min={1}
                  value={installmentsCount ?? 1}
                  onChange={(e) =>
                    form.setValue(
                      'installments_count',
                      e.target.value ? Number(e.target.value) : 1,
                    )
                  }
                  className={pillField}
                />
              </div>
            </>
          )}

          <Button type="submit" size="lg" className="w-full">
            <Sparkles className="h-5 w-5" strokeWidth={2.5} />
            Simular
          </Button>
        </form>

        {/* ---------- Resultado ---------- */}
        <div className="space-y-4">
          {!result ? (
            <div className="flex min-h-[12rem] items-center justify-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft">
              <p className="text-sm text-muted-foreground">
                Ingresa los datos y presiona simular.
              </p>
            </div>
          ) : (
            <>
              {/* Veredicto — bloque semáforo dominante */}
              <div
                className={cn(
                  'rounded-3xl px-5 py-6 shadow-soft',
                  verdictBlock[result.verdict],
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl" aria-hidden>
                    {verdictEmoji[result.verdict]}
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {verdictLabel[result.verdict]}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold opacity-90">{result.title}</p>
                <p className="mt-1 text-sm opacity-80">{result.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold',
                      riskChip[result.risk],
                    )}
                  >
                    {riskLabel[result.risk]}
                  </span>
                </div>
              </div>

              {/* Razón de la recomendación */}
              {result.recommendation?.reason && (
                <div className="rounded-2xl bg-card px-4 py-3 text-sm shadow-soft">
                  {result.recommendation.reason}
                </div>
              )}

              {/* Detalle de tarjeta */}
              {result.kind === 'card' && result.suggestedCardId && (
                <div className="space-y-1.5 rounded-2xl bg-card px-4 py-3 shadow-soft">
                  <p className="text-xs text-muted-foreground">
                    Cupo después:{' '}
                    <MoneyDisplay value={result.availableAfter ?? 0} /> ·
                    utilización {Math.round((result.utilizationAfter ?? 0) * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {result.interestFreeDays} días sin interés · pagarías el{' '}
                    {result.realPaymentDate
                      ? formatDateShort(result.realPaymentDate)
                      : '—'}
                  </p>
                </div>
              )}

              {/* Comparación de medios — filas-píldora */}
              {result.recommendation && (
                <div className="space-y-2.5">
                  <p className="text-sm font-extrabold tracking-tight">
                    Comparación de medios
                  </p>
                  <div className="space-y-2">
                    {result.recommendation.ranked.slice(0, 5).map((o) => (
                      <div
                        key={`${o.method}-${o.refId ?? 'x'}`}
                        className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-soft"
                      >
                        <span className="text-sm font-bold">{o.label}</span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold',
                            o.canAfford
                              ? riskChip[o.risk]
                              : 'bg-primary text-primary-foreground',
                          )}
                        >
                          {o.canAfford ? riskLabel[o.risk] : 'No alcanza'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Convertir en transacción real */}
              {result.ok && (
                <Button
                  variant="pill"
                  size="lg"
                  className="w-full"
                  onClick={convertToTransaction}
                  disabled={createTx.isPending}
                >
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                  Convertir en transacción real
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------- Últimas simulaciones ---------- */}
      <div className="space-y-3">
        <h2 className="text-xl font-extrabold tracking-tight">
          Últimas simulaciones
        </h2>
        {!sims.data || sims.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no has simulado nada.</p>
        ) : (
          <MotionList className="space-y-2.5">
            {sims.data.map((s) => (
              <MotionItem key={s.id}>
                <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 shadow-soft">
                  <div className="min-w-0">
                    <MoneyDisplay
                      value={Number(s.input_amount)}
                      className="text-lg font-extrabold tnum"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateShort(s.simulation_date)} · {s.payment_option}
                    </p>
                  </div>
                </div>
              </MotionItem>
            ))}
          </MotionList>
        )}
      </div>
    </div>
  )
}

function fmt(n: number): string {
  return `$${n.toLocaleString('es-CO')}`
}
