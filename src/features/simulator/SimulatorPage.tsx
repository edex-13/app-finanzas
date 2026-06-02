import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Sparkles, ShoppingCart } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { PageHeader } from '@/components/layout/PageHeader'
import { simulationSchema, type SimulationInput } from '@/lib/validations'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useFinancialSnapshot } from '@/hooks/useFinancialSnapshot'
import {
  calculateAvailableCardLimit,
  recommendCardForPurchase,
} from '@/lib/financial-calculations'
import { fromISODate, toISODate, today, formatDateShort } from '@/lib/date-utils'
import { usePurchaseSimulations, useSaveSimulation } from './hooks'

type PaymentOption = SimulationInput['payment_option']

export function SimulatorPage() {
  const accounts = useAccounts()
  const cards = useCreditCards()
  const snap = useFinancialSnapshot()
  const sims = usePurchaseSimulations()
  const save = useSaveSimulation()
  const [submitted, setSubmitted] = useState<SimulationInput | null>(null)

  const form = useForm<SimulationInput>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      input_amount: 0,
      simulation_date: toISODate(today()),
      payment_option: 'cash',
      selected_account_id: null,
      selected_card_id: null,
    },
  })

  const result = useMemo(() => {
    const values = submitted
    if (!values) return null
    const amount = values.input_amount
    const date = fromISODate(values.simulation_date)

    if (values.payment_option === 'cash') {
      const available = snap.data.totalAvailable
      return {
        ok: available >= amount,
        title:
          available >= amount
            ? `Sí puedes comprarlo en efectivo`
            : `No alcanza tu efectivo`,
        message: `Disponible en cuentas: $${available.toLocaleString('es-CO')}. Quedaría $${(available - amount).toLocaleString('es-CO')}.`,
        suggestedCardId: null as string | null,
      }
    }
    if (values.payment_option === 'account') {
      const acc = accounts.data?.find((a) => a.id === values.selected_account_id)
      if (!acc)
        return {
          ok: false,
          title: 'Elige una cuenta',
          message: 'Selecciona la cuenta con la que pagarías.',
          suggestedCardId: null,
        }
      const remaining = Number(acc.balance) - amount
      return {
        ok: remaining >= 0,
        title:
          remaining >= 0
            ? `Sí puedes pagarlo desde ${acc.name}`
            : `No alcanza el saldo en ${acc.name}`,
        message: `Saldo de la cuenta: $${Number(acc.balance).toLocaleString('es-CO')}. Quedaría $${remaining.toLocaleString('es-CO')}.`,
        suggestedCardId: null,
      }
    }
    // card
    const rec = recommendCardForPurchase(amount, date, cards.data ?? [])
    return {
      ok: !!rec.cardId && (rec.newAvailableLimit ?? -1) >= 0,
      title: rec.cardId
        ? `Recomendamos: ${rec.card?.name}`
        : 'Sin tarjeta sugerida',
      message: rec.reason,
      suggestedCardId: rec.cardId,
      newAvailable: rec.newAvailableLimit,
      utilization: rec.utilizationAfter,
    }
  }, [submitted, snap.data, accounts.data, cards.data])

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitted(values)
    try {
      // Persiste
      const r = result // se calculará en próximo render; guarda básico
      await save.mutateAsync({
        input_amount: values.input_amount,
        simulation_date: values.simulation_date,
        payment_option: values.payment_option,
        selected_account_id: values.selected_account_id ?? null,
        selected_card_id: values.selected_card_id ?? null,
        suggested_card_id: null,
        can_afford: r?.ok ?? false,
        impact_json: {},
        note: values.note ?? null,
      })
    } catch (e) {
      toast.error((e as Error).message ?? 'Error guardando simulación')
    }
  })

  const paymentOption = form.watch('payment_option') as PaymentOption

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulador de compra"
        description="¿Puedes comprarlo? Te decimos el impacto y la mejor tarjeta."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la compra</CardTitle>
            <CardDescription>Ingresa monto, fecha y forma de pago.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit} noValidate>
              <FormField
                label="Valor de la compra"
                error={form.formState.errors.input_amount?.message}
              >
                <MoneyInput
                  value={form.watch('input_amount')}
                  onChange={(v) =>
                    form.setValue('input_amount', v, { shouldValidate: true })
                  }
                />
              </FormField>

              <FormField
                label="Fecha de la compra"
                htmlFor="simulation_date"
                error={form.formState.errors.simulation_date?.message}
              >
                <Input
                  id="simulation_date"
                  type="date"
                  {...form.register('simulation_date')}
                />
              </FormField>

              <FormField label="Forma de pago">
                <RadioGroup
                  value={paymentOption}
                  onValueChange={(v) =>
                    form.setValue('payment_option', v as PaymentOption)
                  }
                  className="grid grid-cols-3 gap-2"
                >
                  {(
                    [
                      { v: 'cash', l: 'Efectivo' },
                      { v: 'account', l: 'Cuenta' },
                      { v: 'card', l: 'Tarjeta' },
                    ] as { v: PaymentOption; l: string }[]
                  ).map((o) => (
                    <Label
                      key={o.v}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm ${paymentOption === o.v ? 'border-primary bg-accent' : ''}`}
                    >
                      <RadioGroupItem value={o.v} />
                      {o.l}
                    </Label>
                  ))}
                </RadioGroup>
              </FormField>

              {paymentOption === 'account' && (
                <FormField label="Cuenta">
                  <Select
                    value={form.watch('selected_account_id') ?? ''}
                    onValueChange={(v) =>
                      form.setValue('selected_account_id', v || null)
                    }
                  >
                    <SelectTrigger>
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
                </FormField>
              )}

              <Button type="submit" className="w-full">
                <Sparkles className="mr-2 h-4 w-4" />
                Simular
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            <CardDescription>
              Impacto en tu disponible, deuda y recomendación.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!result ? (
              <p className="text-sm text-muted-foreground">
                Ingresa los datos y presiona simular.
              </p>
            ) : (
              <>
                <Alert variant={result.ok ? 'success' : 'destructive'}>
                  <ShoppingCart className="h-4 w-4" />
                  <AlertTitle>{result.title}</AlertTitle>
                  <AlertDescription>{result.message}</AlertDescription>
                </Alert>

                {paymentOption === 'card' && result.suggestedCardId && (
                  <div className="rounded-md border p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">
                        {cards.data?.find((c) => c.id === result.suggestedCardId)
                          ?.name}
                      </span>
                      <Badge variant="secondary">
                        cupo nuevo:{' '}
                        <MoneyDisplay
                          value={result.newAvailable ?? 0}
                          className="ml-1"
                        />
                      </Badge>
                    </div>
                    {result.utilization !== undefined && (
                      <p className="text-xs text-muted-foreground">
                        Utilización post-compra:{' '}
                        {Math.round(result.utilization * 100)}%
                      </p>
                    )}
                  </div>
                )}

                {paymentOption === 'card' && (cards.data ?? []).length > 0 && (
                  <div className="space-y-2 text-xs">
                    <p className="font-medium">Comparación rápida</p>
                    {(cards.data ?? []).map((c) => {
                      const av = calculateAvailableCardLimit(c)
                      return (
                        <div
                          key={c.id}
                          className="flex justify-between border-b pb-1 last:border-0"
                        >
                          <span>{c.name}</span>
                          <span>
                            cupo <MoneyDisplay value={av} />, corte día{' '}
                            {c.statement_day}, pago día {c.payment_due_day}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas simulaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!sims.data || sims.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no has simulado nada.
            </p>
          ) : (
            sims.data.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <div>
                  <MoneyDisplay
                    value={Number(s.input_amount)}
                    className="font-medium"
                  />
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateShort(s.simulation_date)} · {s.payment_option}
                  </span>
                </div>
                <Badge variant={s.can_afford ? 'success' : 'destructive'}>
                  {s.can_afford ? 'Podías comprar' : 'No alcanzaba'}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
