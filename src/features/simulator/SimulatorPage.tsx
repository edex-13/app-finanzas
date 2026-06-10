import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { MoneyInput } from '@/components/common/MoneyInput'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
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
import { toISODate, today, formatDateShort } from '@/lib/date-utils'
import { usePurchaseSimulations, useSaveSimulation } from './hooks'

type PaymentOption = 'cash' | 'account' | 'card'

const methodEmoji: Record<PaymentOption, string> = {
  cash: '💵',
  account: '🏦',
  card: '💳',
}
const methodLabel: Record<PaymentOption, string> = {
  cash: 'Efectivo',
  account: 'Cuenta',
  card: 'Tarjeta',
}

/** Veredicto en lenguaje humano (cero jerga). */
const verdictLabel: Record<PurchaseVerdict, string> = {
  buy: 'Cómprala tranquilo',
  wait: 'Mejor espera',
  cannot: 'No te alcanza',
}
const verdictEmoji: Record<PurchaseVerdict, string> = {
  buy: '✅',
  wait: '🤔',
  cannot: '🚫',
}
/** Bloque-semáforo: pastel para bien/ojo, coral solo para alerta. */
const verdictBlock: Record<PurchaseVerdict, string> = {
  buy: 'bg-pastel-mint text-black/80',
  wait: 'bg-pastel-sand text-black/80',
  cannot: 'bg-destructive text-destructive-foreground',
}

/** Riesgo traducido a palabras de persona, no de banco. */
const riskHuman: Record<PurchaseRisk, string> = {
  low: 'Con holgura',
  medium: 'Justo',
  high: 'Arriesgado',
}
const riskChip: Record<PurchaseRisk, string> = {
  low: 'bg-pastel-mint text-black/70',
  medium: 'bg-pastel-sand text-black/70',
  high: 'bg-destructive text-destructive-foreground',
}

interface CompareOption {
  key: string
  method: PaymentOption
  refId: string | null
  label: string
  phrase: string
  canAfford: boolean
  risk: PurchaseRisk
}

interface LiveResult {
  ok: boolean
  verdict: PurchaseVerdict
  risk: PurchaseRisk
  /** Frase concreta: "Te quedarían $X después de comprarla". */
  headline: string
  /** Segunda línea opcional (fechas, matices). */
  detail: string | null
  /** Tarjeta efectivamente usada (elegida o sugerida). */
  cardId: string | null
  /** Sugerencia de tarjeta con el porqué (solo en modo auto). */
  suggestion: string | null
  compare: CompareOption[]
}

export function SimulatorPage() {
  const accounts = useAccounts()
  const cards = useCreditCards()
  const snap = useFinancialSnapshot()
  const sims = usePurchaseSimulations()
  const save = useSaveSimulation()
  const createTx = useCreateTransaction()

  // --- Estado del flujo (sin submit: todo recalcula en vivo) ---
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentOption>('cash')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [cardId, setCardId] = useState<string | null>(null) // null = sugerida
  const [necessary, setNecessary] = useState(true)
  const [installments, setInstallments] = useState(1)

  const activeAccounts = useMemo(
    () => (accounts.data ?? []).filter((a) => !a.archived),
    [accounts.data],
  )
  const activeCards = useMemo(
    () => (cards.data ?? []).filter((c) => !c.archived),
    [cards.data],
  )

  // Colchón de emergencia simple: 10% del disponible (heurística v1).
  const emergencyMinimum = useMemo(
    () => Math.round(snap.data.totalAvailable * 0.1),
    [snap.data.totalAvailable],
  )

  // --- Resultado EN VIVO: cálculo puro local, sin botón "Simular" ---
  const result = useMemo<LiveResult | null>(() => {
    if (amount <= 0) return null
    const date = today()

    const recommendation = recommendBestPaymentMethod({
      amount,
      totalAvailable: snap.data.totalAvailable,
      accounts: activeAccounts,
      cards: activeCards,
      necessary,
      emergencyMinimum,
      purchaseDate: date,
    })

    // Veredicto local para el medio elegido (mismas reglas de la lib).
    const verdictFor = (canAfford: boolean, risk: PurchaseRisk): PurchaseVerdict =>
      !canAfford
        ? 'cannot'
        : risk === 'high' || (!necessary && risk !== 'low')
          ? 'wait'
          : 'buy'

    // Comparación traducida a frases humanas (una por medio).
    const compare: CompareOption[] = recommendation.ranked
      .slice(0, 5)
      .map((o) => {
        let phrase = o.reason
        if (o.method === 'cash') {
          const sim = simulateCashPurchase({
            amount,
            availableBalance: snap.data.totalAvailable,
            emergencyMinimum,
          })
          phrase = sim.canAfford
            ? `Te quedarían ${formatMoney(sim.balanceAfter)}`
            : `No alcanza: tienes ${formatMoney(snap.data.totalAvailable)}`
        } else if (o.method === 'account') {
          const acc = activeAccounts.find((a) => a.id === o.refId)
          if (acc) {
            const sim = simulateCashPurchase({
              amount,
              availableBalance: Number(acc.balance),
              emergencyMinimum,
            })
            phrase = sim.canAfford
              ? `Te quedarían ${formatMoney(sim.balanceAfter)}`
              : `No alcanza: tiene ${formatMoney(Number(acc.balance))}`
          }
        } else {
          const card = activeCards.find((c) => c.id === o.refId)
          if (card) {
            const sim = simulateCreditCardPurchase({ amount, card, purchaseDate: date })
            const cutoff = calculateCardCutoffImpact(card, date)
            phrase = sim.canAfford
              ? `${cutoff.interestFreeDays} días sin intereses · usarías el ${Math.round(sim.utilizationAfter * 100)}% del cupo`
              : `Supera el cupo: queda ${formatMoney(Math.max(0, sim.availableAfter + amount))}`
          }
        }
        return {
          key: `${o.method}-${o.refId ?? 'x'}`,
          method: o.method,
          refId: o.refId,
          label: o.method === 'cash' ? 'Todo tu disponible' : o.label,
          phrase,
          canAfford: o.canAfford,
          risk: o.risk,
        }
      })

    // --- Efectivo / Cuenta ---
    if (method === 'cash' || method === 'account') {
      const acc =
        method === 'account'
          ? activeAccounts.find((a) => a.id === accountId) ?? null
          : null
      if (method === 'account' && !acc) {
        return {
          ok: false,
          verdict: 'cannot',
          risk: 'high',
          headline: 'Elige la cuenta con la que pagarías.',
          detail: null,
          cardId: null,
          suggestion: null,
          compare,
        }
      }
      const balance = acc ? Number(acc.balance) : snap.data.totalAvailable
      const sim = simulateCashPurchase({
        amount,
        availableBalance: balance,
        emergencyMinimum,
      })
      const verdict = verdictFor(sim.canAfford, sim.risk)
      const where = acc ? `en ${acc.name}` : 'disponibles'

      let headline: string
      let detail: string | null = null
      if (!sim.canAfford) {
        headline = `No te alcanza: tienes ${formatMoney(balance)} ${where} y cuesta ${formatMoney(amount)}.`
      } else if (sim.belowEmergencyMinimum) {
        headline = 'Quedarías por debajo de tu colchón de emergencia.'
        detail = `Te quedarían ${formatMoney(sim.balanceAfter)} y tu colchón es ${formatMoney(emergencyMinimum)}.`
      } else {
        headline = `Te quedarían ${formatMoney(sim.balanceAfter)} después de comprarla.`
        if (verdict === 'wait') {
          detail = !necessary
            ? 'No es una compra necesaria y el margen queda ajustado: dale unos días.'
            : 'Puedes, pero quedarías con poco margen.'
        } else if (sim.risk === 'medium') {
          detail = 'Puedes, pero quedarías con poco margen.'
        }
      }
      return {
        ok: sim.canAfford,
        verdict,
        risk: sim.risk,
        headline,
        detail,
        cardId: null,
        suggestion: null,
        compare,
      }
    }

    // --- Tarjeta (elegida o la mejor sugerida del ranking) ---
    const bestCardId =
      recommendation.ranked.find((o) => o.method === 'card' && o.canAfford)?.refId ??
      recommendation.ranked.find((o) => o.method === 'card')?.refId ??
      null
    const chosenCard =
      activeCards.find((c) => c.id === cardId) ??
      activeCards.find((c) => c.id === bestCardId)
    if (!chosenCard) {
      return {
        ok: false,
        verdict: 'cannot',
        risk: 'high',
        headline: 'No tienes tarjetas registradas.',
        detail: 'Agrega una tarjeta o paga con efectivo / cuenta.',
        cardId: null,
        suggestion: null,
        compare,
      }
    }

    const sim = simulateCreditCardPurchase({ amount, card: chosenCard, purchaseDate: date })
    const cutoff = calculateCardCutoffImpact(chosenCard, date)
    const verdict = verdictFor(sim.canAfford, sim.risk)
    const payDateTxt = sim.realPaymentDate ? formatDateShort(sim.realPaymentDate) : null

    let headline: string
    let detail: string | null
    if (!sim.canAfford) {
      headline = `Supera el cupo disponible de ${chosenCard.name}.`
      detail = `Te queda ${formatMoney(Math.max(0, sim.availableAfter + amount))} de cupo y cuesta ${formatMoney(amount)}.`
    } else {
      headline = `Usarías el ${Math.round(sim.utilizationAfter * 100)}% del cupo de ${chosenCard.name}.`
      const dates = `${cutoff.interestFreeDays} días sin intereses${payDateTxt ? ` (pagas el ${payDateTxt})` : ''}.`
      detail =
        verdict === 'wait'
          ? sim.risk === 'high'
            ? `El cupo quedaría muy exigido. ${dates}`
            : `No es una compra necesaria: podrías esperar. ${dates}`
          : dates
    }

    const suggestion =
      !cardId && sim.canAfford
        ? `Te sugerimos ${chosenCard.name}: te da ${cutoff.interestFreeDays} días sin intereses${payDateTxt ? ` (pagas el ${payDateTxt})` : ''}.`
        : null

    return {
      ok: sim.canAfford,
      verdict,
      risk: sim.risk,
      headline,
      detail,
      cardId: chosenCard.id,
      suggestion,
      compare,
    }
  }, [
    amount,
    method,
    accountId,
    cardId,
    necessary,
    snap.data.totalAvailable,
    activeAccounts,
    activeCards,
    emergencyMinimum,
  ])

  // --- Acciones ---
  const registerExpense = async () => {
    if (!result || amount <= 0) return
    try {
      if (method === 'card') {
        await createTx.mutateAsync({
          date: toISODate(today()),
          amount,
          kind: 'expense',
          credit_card_id: result.cardId,
          account_id: null,
          counterparty_account_id: null,
          category_id: null,
          debt_id: null,
          debt_installment_id: null,
          note: 'Compra simulada',
          installments_count: installments > 1 ? installments : null,
        })
      } else {
        const accId =
          method === 'account'
            ? accountId
            : activeAccounts[0]?.id ?? null
        await createTx.mutateAsync({
          date: toISODate(today()),
          amount,
          kind: 'expense',
          account_id: accId,
          counterparty_account_id: null,
          credit_card_id: null,
          category_id: null,
          debt_id: null,
          debt_installment_id: null,
          note: 'Compra simulada',
        })
      }
      toast.success('Gasto registrado')
      setAmount(0)
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo registrar')
    }
  }

  const saveSimulation = async () => {
    if (!result || amount <= 0) return
    try {
      await save.mutateAsync({
        input_amount: amount,
        simulation_date: toISODate(today()),
        payment_option: method,
        selected_account_id: method === 'account' ? accountId : null,
        selected_card_id: method === 'card' ? cardId : null,
        suggested_card_id: method === 'card' ? result.cardId : null,
        can_afford: result.ok,
        impact_json: { necessary },
        note: null,
      })
      toast.success('Simulación guardada')
    } catch (e) {
      toast.error((e as Error).message ?? 'Error guardando simulación')
    }
  }

  /** Cambiar de medio desde los chips (autoselecciona la primera cuenta). */
  const pickMethod = (m: PaymentOption) => {
    setMethod(m)
    if (m === 'account' && !accountId) setAccountId(activeAccounts[0]?.id ?? null)
  }

  /** Tap en una fila de la comparación = usar ese medio. */
  const pickCompareOption = (o: CompareOption) => {
    setMethod(o.method)
    if (o.method === 'account') setAccountId(o.refId)
    if (o.method === 'card') setCardId(o.refId)
  }

  /** Tap en una simulación reciente = rellenar el formulario. */
  const fillFromHistory = (s: {
    input_amount: number | string
    payment_option: string
    selected_account_id: string | null
    selected_card_id: string | null
  }) => {
    setAmount(Number(s.input_amount))
    const m = (['cash', 'account', 'card'] as const).includes(
      s.payment_option as PaymentOption,
    )
      ? (s.payment_option as PaymentOption)
      : 'cash'
    setMethod(m)
    setAccountId(s.selected_account_id ?? activeAccounts[0]?.id ?? null)
    setCardId(s.selected_card_id)
  }

  const optionPill = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-all active:scale-[0.97]',
      active ? 'bg-foreground text-background' : 'bg-secondary text-foreground',
    )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Simulador de compra"
        description="Escribe el precio y te decimos al instante si te conviene."
      />

      <div className="mx-auto w-full max-w-xl space-y-6">
        {/* ---------- 1. La pregunta protagonista ---------- */}
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-muted-foreground">
            ¿Cuánto cuesta?
          </p>
          <MoneyInput
            autoFocus
            value={amount || undefined}
            onChange={setAmount}
            className="h-auto border-0 bg-transparent p-0 text-hero text-5xl text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-6xl"
          />
        </div>

        {/* ---------- 2. ¿Con qué pagarías? ---------- */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">
            ¿Con qué pagarías?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'account', 'card'] as const).map((m) => {
              const active = method === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMethod(m)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-bold transition-all active:scale-[0.97]',
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-secondary text-foreground',
                  )}
                >
                  <span aria-hidden>{methodEmoji[m]}</span>
                  {methodLabel[m]}
                </button>
              )
            })}
          </div>

          {/* Cuenta: píldoras con saldo */}
          {method === 'account' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {activeAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No tienes cuentas activas.
                </p>
              ) : (
                activeAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className={optionPill(accountId === a.id)}
                  >
                    {a.name}
                    <span
                      className={cn(
                        'text-[11px] font-bold',
                        accountId === a.id
                          ? 'text-background/60'
                          : 'text-muted-foreground',
                      )}
                    >
                      <MoneyDisplay
                        value={Number(a.balance)}
                        negativeClass=""
                      />
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Tarjeta: "La mejor" + cada tarjeta, y el porqué de la sugerencia */}
          {method === 'card' && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCardId(null)}
                  className={optionPill(cardId === null)}
                >
                  ✨ La mejor
                </button>
                {activeCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCardId(c.id)}
                    className={optionPill(cardId === c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {result?.suggestion && (
                <p className="text-xs font-semibold text-muted-foreground">
                  ✨ {result.suggestion}
                </p>
              )}

              {/* Cuotas: stepper simple */}
              <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-2.5">
                <span className="text-sm font-bold">Cuotas</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="Menos cuotas"
                    onClick={() => setInstallments((n) => Math.max(1, n - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground transition-all active:scale-90"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                  <span className="w-8 text-center text-base font-extrabold tnum">
                    {installments}
                  </span>
                  <button
                    type="button"
                    aria-label="Más cuotas"
                    onClick={() => setInstallments((n) => Math.min(60, n + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground transition-all active:scale-90"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---------- 3. ¿Es necesaria? ---------- */}
        <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
          <span className="text-sm font-bold">¿Es una compra necesaria?</span>
          <Switch checked={necessary} onCheckedChange={setNecessary} />
        </div>

        {/* ---------- 4. Veredicto EN VIVO ---------- */}
        {!result ? (
          <div className="rounded-3xl bg-card px-6 py-8 text-center shadow-soft">
            <p className="text-sm text-muted-foreground">
              Escribe cuánto cuesta y te decimos al instante si te conviene. 👆
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'rounded-3xl px-5 py-6 shadow-soft transition-colors',
                verdictBlock[result.verdict],
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-3xl" aria-hidden>
                  {verdictEmoji[result.verdict]}
                </span>
                <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {verdictLabel[result.verdict]}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold opacity-90">{result.headline}</p>
              {result.detail && (
                <p className="mt-1 text-sm opacity-80">{result.detail}</p>
              )}
            </div>

            {/* Acciones */}
            <div className="space-y-2.5">
              {result.ok && (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={registerExpense}
                  disabled={createTx.isPending}
                >
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                  Registrar como gasto
                </Button>
              )}
              <Button
                variant="pill"
                size="lg"
                className="w-full"
                onClick={saveSimulation}
                disabled={save.isPending}
              >
                Guardar simulación
              </Button>
            </div>

            {/* ---------- 5. Comparación plegada ---------- */}
            {result.compare.length > 0 && (
              <details className="group rounded-3xl bg-card shadow-soft">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm font-extrabold tracking-tight">
                    Comparar medios de pago
                  </span>
                  <ChevronDown
                    className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                    strokeWidth={2.5}
                  />
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {result.compare.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => pickCompareOption(o)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3 text-left transition-all active:scale-[0.97]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          <span aria-hidden>{methodEmoji[o.method]}</span>{' '}
                          {o.label}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {o.phrase}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                          o.canAfford
                            ? riskChip[o.risk]
                            : 'bg-destructive text-destructive-foreground',
                        )}
                      >
                        {o.canAfford ? riskHuman[o.risk] : 'No alcanza'}
                      </span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {/* ---------- 6. Simulaciones recientes ---------- */}
        <div className="space-y-3 pt-2">
          <h2 className="text-xl font-extrabold tracking-tight">
            Simulaciones recientes
          </h2>
          {!sims.data || sims.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no has simulado nada.
            </p>
          ) : (
            <MotionList className="space-y-2.5">
              {sims.data.map((s) => {
                const m = (s.payment_option as PaymentOption) in methodEmoji
                  ? (s.payment_option as PaymentOption)
                  : 'cash'
                return (
                  <MotionItem key={s.id}>
                    <button
                      type="button"
                      onClick={() => fillFromHistory(s)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-soft transition-all active:scale-[0.97]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-lg"
                        >
                          {methodEmoji[m]}
                        </span>
                        <div className="min-w-0">
                          <MoneyDisplay
                            value={Number(s.input_amount)}
                            className="text-base font-extrabold tnum"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {formatDateShort(s.simulation_date)} ·{' '}
                            {methodLabel[m]}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                          s.can_afford
                            ? 'bg-pastel-mint text-black/70'
                            : 'bg-secondary text-muted-foreground',
                        )}
                      >
                        {s.can_afford ? 'Alcanzaba' : 'Simulada'}
                      </span>
                    </button>
                  </MotionItem>
                )
              })}
            </MotionList>
          )}
        </div>
      </div>
    </div>
  )
}
