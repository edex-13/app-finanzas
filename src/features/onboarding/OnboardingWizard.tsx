import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Briefcase,
  Check,
  CreditCard,
  ListChecks,
  PartyPopper,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AccountForm } from '@/features/accounts/AccountForm'
import { CreditCardForm } from '@/features/credit-cards/CreditCardForm'
import { DebtForm } from '@/features/debts/DebtForm'
import { IncomeForm } from '@/features/income/IncomeForm'
import { useCreateAccount, useAccounts } from '@/features/accounts/hooks'
import { useCreateCard, useCreditCards } from '@/features/credit-cards/hooks'
import { useCreateDebt, useDebts } from '@/features/debts/hooks'
import { useCreateIncomeSource, useIncomeSources } from '@/features/income/hooks'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCompleteOnboarding } from '@/hooks/useProfile'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'

type StepKey = 'welcome' | 'accounts' | 'cards' | 'debts' | 'income' | 'done'

const steps: {
  key: StepKey
  label: string
  icon: React.ElementType
  emoji: string
  title: string
  subtitle: string
}[] = [
  {
    key: 'welcome',
    label: 'Bienvenida',
    icon: PartyPopper,
    emoji: '👋',
    title: 'Hola, configuremos tu dinero',
    subtitle: 'Cuatro pasos cortos. Puedes saltar cualquiera y completarlo después.',
  },
  {
    key: 'accounts',
    label: 'Cuentas',
    icon: Wallet,
    emoji: '💵',
    title: 'Tus cuentas',
    subtitle: 'Efectivo, bancos y billeteras digitales.',
  },
  {
    key: 'cards',
    label: 'Tarjetas',
    icon: CreditCard,
    emoji: '💳',
    title: 'Tus tarjetas',
    subtitle: 'Cupos, deudas y fechas de corte y pago.',
  },
  {
    key: 'debts',
    label: 'Deudas',
    icon: ListChecks,
    emoji: '📋',
    title: 'Tus deudas',
    subtitle: 'Créditos, hipotecas y obligaciones recurrentes.',
  },
  {
    key: 'income',
    label: 'Ingresos',
    icon: Briefcase,
    emoji: '💼',
    title: 'Tus ingresos',
    subtitle: 'Salario y otras fuentes recurrentes.',
  },
  {
    key: 'done',
    label: 'Listo',
    icon: Check,
    emoji: '🎉',
    title: '¡Todo listo!',
    subtitle: 'Ya puedes ver tu dashboard y registrar movimientos.',
  },
]

export function OnboardingWizard() {
  const [step, setStep] = useState<StepKey>('welcome')
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const completeOnboarding = useCompleteOnboarding()

  const accounts = useAccounts()
  const cards = useCreditCards()
  const debts = useDebts()
  const incomes = useIncomeSources()

  const createAccount = useCreateAccount()
  const createCard = useCreateCard()
  const createDebt = useCreateDebt()
  const createIncome = useCreateIncomeSource()

  const stepIdx = steps.findIndex((s) => s.key === step)
  const meta = steps[stepIdx]
  // Pasos "reales" para la barra de progreso (sin bienvenida ni final).
  const progressTotal = steps.length - 2
  const progressDone = Math.min(Math.max(stepIdx - 1, 0), progressTotal)

  function go(idx: number) {
    const s = steps[idx]
    if (s) setStep(s.key)
  }

  const counts: Partial<Record<StepKey, number>> = {
    accounts: accounts.data?.length ?? 0,
    cards: cards.data?.length ?? 0,
    debts: debts.data?.length ?? 0,
    income: incomes.data?.length ?? 0,
  }
  const currentCount = counts[step] ?? 0

  async function finish() {
    await completeOnboarding.mutateAsync()
    toast.success('¡Onboarding completado!')
    navigate(paths.dashboard, { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col bg-background safe-pt safe-pb">
      {/* Barra superior: atrás + progreso por segmentos */}
      <header className="flex items-center gap-3 px-5 pt-3">
        {stepIdx > 0 && step !== 'done' ? (
          <button
            onClick={() => go(stepIdx - 1)}
            aria-label="Atrás"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground transition-transform active:scale-90"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0" />
        )}

        <div className="flex flex-1 items-center gap-1.5">
          {Array.from({ length: progressTotal }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < progressDone ? 'bg-primary' : 'bg-secondary',
              )}
            />
          ))}
        </div>

        <button
          onClick={async () => {
            await signOut()
            navigate(paths.login)
          }}
          className="shrink-0 text-xs font-semibold text-muted-foreground"
        >
          Salir
        </button>
      </header>

      {/* Contenido del paso */}
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-1 flex-col"
          >
            {/* Cabecera grande y visual */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-secondary text-4xl">
                {meta.emoji}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">{meta.title}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                {meta.subtitle}
              </p>
              {step !== 'welcome' && step !== 'done' && currentCount > 0 && (
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-pastel-mint/20 px-3.5 py-1.5 text-xs font-bold text-pastel-mint">
                  <Check className="h-3.5 w-3.5" /> {currentCount} agregada
                  {currentCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Cuerpo */}
            <div className="flex-1">
              {step === 'welcome' && (
                <Button className="w-full" size="lg" onClick={() => go(1)}>
                  Empezar
                </Button>
              )}

              {step === 'accounts' && (
                <AccountForm
                  onSubmit={async (values) => {
                    await createAccount.mutateAsync(values)
                    toast.success('Cuenta agregada')
                  }}
                  submitLabel="Agregar cuenta"
                />
              )}

              {step === 'cards' && (
                <CreditCardForm
                  onSubmit={async (values) => {
                    await createCard.mutateAsync(values)
                    toast.success('Tarjeta agregada')
                  }}
                  submitLabel="Agregar tarjeta"
                />
              )}

              {step === 'debts' && (
                <DebtForm
                  onSubmit={async (values) => {
                    await createDebt.mutateAsync(values)
                    toast.success('Deuda agregada')
                  }}
                  submitLabel="Agregar deuda"
                />
              )}

              {step === 'income' && (
                <IncomeForm
                  onSubmit={async (values) => {
                    await createIncome.mutateAsync(values)
                    toast.success('Ingreso agregado')
                  }}
                  submitLabel="Agregar ingreso"
                />
              )}

              {step === 'done' && (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={finish}
                  disabled={completeOnboarding.isPending}
                >
                  {completeOnboarding.isPending ? 'Guardando…' : 'Ir al dashboard'}
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navegación inferior fija (pasos con formulario) */}
      {step !== 'welcome' && step !== 'done' && (
        <footer className="sticky bottom-0 mx-auto w-full max-w-lg px-5 py-4">
          <Button className="w-full" size="lg" onClick={() => go(stepIdx + 1)}>
            {currentCount > 0 ? 'Continuar' : 'Saltar este paso'}
          </Button>
        </footer>
      )}
    </div>
  )
}
