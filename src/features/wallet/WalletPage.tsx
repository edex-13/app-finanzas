import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CreditCard, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { MoneyDisplay } from '@/components/common/MoneyDisplay'
import { MotionList, MotionItem } from '@/components/common/Motion'
import { PageHeader } from '@/components/layout/PageHeader'
import { AccountForm } from '@/features/accounts/AccountForm'
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from '@/features/accounts/hooks'
import { CreditCardForm } from '@/features/credit-cards/CreditCardForm'
import {
  useCreateCard,
  useCreditCards,
  useDeleteCard,
  useUpdateCard,
} from '@/features/credit-cards/hooks'
import {
  calculateAvailableCardLimit,
  nextPaymentDueDate,
  nextStatementDate,
} from '@/lib/financial-calculations'
import { formatDateShort } from '@/lib/date-utils'
import { formatPercent } from '@/lib/format'
import type {
  AccountRow,
  AccountType,
  CreditCardRow,
} from '@/types/database'

type Tab = 'accounts' | 'cards'

const typeLabel: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Bancaria',
  digital_wallet: 'Billetera',
  other: 'Otra',
}

export function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(
    searchParams.get('tab') === 'cards' ? 'cards' : 'accounts',
  )

  function changeTab(next: Tab) {
    setTab(next)
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'cards') p.set('tab', 'cards')
        else p.delete('tab')
        return p
      },
      { replace: true },
    )
  }

  return (
    <div>
      <PageHeader title="Cuentas y tarjetas" />

      {/* Switch deslizable (segmented control) estilo MonAi */}
      <SegmentedSwitch value={tab} onChange={changeTab} />

      <div className="mt-6">
        {tab === 'accounts' ? <AccountsSection /> : <CardsSection />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Switch deslizable: indicador morado que se mueve entre las mitades. */
/* ------------------------------------------------------------------ */

function SegmentedSwitch({
  value,
  onChange,
}: {
  value: Tab
  onChange: (t: Tab) => void
}) {
  const options: { value: Tab; label: string }[] = [
    { value: 'accounts', label: 'Cuentas' },
    { value: 'cards', label: 'Tarjetas' },
  ]
  return (
    <div className="flex w-full rounded-full bg-secondary p-1 sm:max-w-xs">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className="relative flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors"
          >
            {active && (
              <motion.span
                layoutId="wallet-switch-indicator"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-full bg-primary"
              />
            )}
            <span
              className={
                active
                  ? 'relative z-10 text-primary-foreground'
                  : 'relative z-10 text-muted-foreground'
              }
            >
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sección de Cuentas                                                  */
/* ------------------------------------------------------------------ */

function AccountsSection() {
  const { data, isLoading } = useAccounts()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const del = useDeleteAccount()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<AccountRow | null>(null)

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      <ResponsiveModal
        open={openNew}
        onOpenChange={setOpenNew}
        title="Nueva cuenta"
        description="Una cuenta puede ser efectivo, banco, billetera u otro saldo."
      >
        <AccountForm
          onCancel={() => setOpenNew(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            toast.success('Cuenta creada')
            setOpenNew(false)
          }}
        />
      </ResponsiveModal>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="Aún no tienes cuentas"
          description="Agrega tu primera cuenta para empezar a llevar el control."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear cuenta
            </Button>
          }
        />
      ) : (
        <MotionList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => (
            <MotionItem key={a.id}>
              <Card className="overflow-hidden">
                <div
                  className="h-1.5 w-full"
                  style={{ background: a.color ?? 'hsl(var(--primary))' }}
                />
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.institution ?? '—'}
                      </p>
                    </div>
                    <Badge variant="secondary">{typeLabel[a.type]}</Badge>
                  </div>
                  <MoneyDisplay
                    value={Number(a.balance)}
                    className="text-2xl font-semibold tnum"
                  />
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar "${a.name}"?`)) return
                        await del.mutateAsync(a.id)
                        toast.success('Cuenta eliminada')
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </MotionItem>
          ))}
        </MotionList>
      )}

      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar cuenta"
      >
        {editing && (
          <AccountForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: editing.id, input: values })
              toast.success('Cuenta actualizada')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sección de Tarjetas                                                 */
/* ------------------------------------------------------------------ */

function CardsSection() {
  const { data, isLoading } = useCreditCards()
  const create = useCreateCard()
  const update = useUpdateCard()
  const del = useDeleteCard()
  const [openNew, setOpenNew] = useState(false)
  const [editing, setEditing] = useState<CreditCardRow | null>(null)

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva tarjeta
        </Button>
      </div>

      <ResponsiveModal
        open={openNew}
        onOpenChange={setOpenNew}
        title="Nueva tarjeta de crédito"
      >
        <CreditCardForm
          onCancel={() => setOpenNew(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values)
            toast.success('Tarjeta creada')
            setOpenNew(false)
          }}
        />
      </ResponsiveModal>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="Aún no tienes tarjetas"
          description="Registra tus tarjetas para ver cupos, fechas de corte y pago."
          action={
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Crear tarjeta
            </Button>
          }
        />
      ) : (
        <MotionList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => {
            const available = calculateAvailableCardLimit(c)
            const util = c.credit_limit > 0 ? c.current_debt / c.credit_limit : 0
            return (
              <MotionItem key={c.id}>
                <Card className="overflow-hidden">
                  <div
                    className="h-16 w-full"
                    style={{
                      backgroundColor: c.color ?? 'hsl(var(--secondary))',
                    }}
                  />
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.bank ?? '—'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        Corte día{' '}
                        <span className="font-medium text-foreground">
                          {c.statement_day}
                        </span>
                        <br />
                        Pago día{' '}
                        <span className="font-medium text-foreground">
                          {c.payment_due_day}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Cupo disponible
                        </p>
                        <MoneyDisplay
                          value={available}
                          className="font-semibold tnum"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Deuda actual
                        </p>
                        <MoneyDisplay
                          value={Number(c.current_debt)}
                          className="font-semibold tnum"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Utilización</span>
                        <span className="tnum">{formatPercent(util)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={
                            util >= 0.9 ? 'h-full bg-destructive' : 'h-full bg-primary'
                          }
                          style={{ width: `${Math.min(100, util * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Próx. corte: {formatDateShort(nextStatementDate(c))}
                      </span>
                      <span>
                        Próx. pago: {formatDateShort(nextPaymentDueDate(c))}
                      </span>
                    </div>

                    <div className="flex justify-end gap-1 pt-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`¿Eliminar "${c.name}"?`)) return
                          await del.mutateAsync(c.id)
                          toast.success('Tarjeta eliminada')
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </MotionItem>
            )
          })}
        </MotionList>
      )}

      <ResponsiveModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar tarjeta"
      >
        {editing && (
          <CreditCardForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: editing.id, input: values })
              toast.success('Tarjeta actualizada')
              setEditing(null)
            }}
          />
        )}
      </ResponsiveModal>
    </div>
  )
}
