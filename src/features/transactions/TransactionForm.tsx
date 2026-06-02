import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import {
  transactionSchema,
  type TransactionInput,
} from '@/lib/validations'
import { useAccounts } from '@/features/accounts/hooks'
import { useCreditCards } from '@/features/credit-cards/hooks'
import { useDebts } from '@/features/debts/hooks'
import { useCategories } from './hooks'
import type { TransactionKind } from '@/types/database'
import { toISODate, today } from '@/lib/date-utils'

interface Props {
  defaultKind?: TransactionKind
  onSubmit: (values: TransactionInput) => Promise<void> | void
  onCancel?: () => void
}

const kindLabel: Record<TransactionKind, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  debt_payment: 'Pago de deuda',
  card_payment: 'Pago de tarjeta',
  transfer: 'Transferencia',
}

export function TransactionForm({
  defaultKind = 'expense',
  onSubmit,
  onCancel,
}: Props) {
  const { data: accounts = [] } = useAccounts()
  const { data: cards = [] } = useCreditCards()
  const { data: debts = [] } = useDebts()
  const { data: categories = [] } = useCategories()

  const form = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      date: toISODate(today()),
      amount: 0,
      kind: defaultKind,
      category_id: null,
      account_id: null,
      credit_card_id: null,
      debt_id: null,
      debt_installment_id: null,
      note: '',
    },
  })

  const kind = form.watch('kind')
  const filteredCategories = categories.filter((c) => c.kind === kind)

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit({
        ...values,
        category_id: values.category_id || null,
        account_id: values.account_id || null,
        credit_card_id: values.credit_card_id || null,
        debt_id: values.debt_id || null,
        debt_installment_id: values.debt_installment_id || null,
      })
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tipo">
          <Select
            value={kind}
            onValueChange={(v) =>
              form.setValue('kind', v as TransactionKind, { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                ['income', 'expense', 'debt_payment', 'card_payment', 'transfer'] as TransactionKind[]
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabel[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="Fecha"
          htmlFor="date"
          error={form.formState.errors.date?.message}
        >
          <Input id="date" type="date" {...form.register('date')} />
        </FormField>
      </div>

      <FormField
        label="Monto"
        error={form.formState.errors.amount?.message}
      >
        <MoneyInput
          value={form.watch('amount')}
          onChange={(v) =>
            form.setValue('amount', v, { shouldValidate: true })
          }
        />
      </FormField>

      <FormField label="Categoría">
        <Select
          value={form.watch('category_id') ?? ''}
          onValueChange={(v) =>
            form.setValue('category_id', v === '__none' ? null : v)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Sin categoría</SelectItem>
            {filteredCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {(kind === 'income' || kind === 'expense' || kind === 'debt_payment' || kind === 'card_payment') && (
        <FormField label="Cuenta">
          <Select
            value={form.watch('account_id') ?? ''}
            onValueChange={(v) =>
              form.setValue('account_id', v === '__none' ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Ninguna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Ninguna</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {(kind === 'expense' || kind === 'card_payment') && cards.length > 0 && (
        <FormField
          label={kind === 'card_payment' ? 'Tarjeta a pagar' : 'Tarjeta (opcional)'}
        >
          <Select
            value={form.watch('credit_card_id') ?? ''}
            onValueChange={(v) =>
              form.setValue('credit_card_id', v === '__none' ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Sin tarjeta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Sin tarjeta</SelectItem>
              {cards.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {kind === 'debt_payment' && debts.length > 0 && (
        <FormField label="Deuda">
          <Select
            value={form.watch('debt_id') ?? ''}
            onValueChange={(v) =>
              form.setValue('debt_id', v === '__none' ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una deuda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Selecciona una deuda</SelectItem>
              {debts.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      <FormField label="Nota" htmlFor="note">
        <Textarea id="note" rows={2} {...form.register('note')} />
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Guardar
        </Button>
      </div>
    </form>
  )
}
