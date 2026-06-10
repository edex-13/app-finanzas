import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type {
  CategoryRow,
  RecurringTransactionRow,
  TransactionKind,
  TransactionRow,
} from '@/types/database'
import type {
  CategoryInput,
  RecurringTransactionInput,
  TransactionInput,
} from '@/lib/validations'
import { advanceNextOccurrence } from '@/lib/recurrence'
import { generateCardInstallments } from '@/lib/financial-calculations'
import { addMonths, toISODate, fromISODate } from '@/lib/date-utils'

// Categories ------------------------------------------------------
export function useCategories() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.categories(user.id) : ['categories', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user!.id)
        .order('name')
      if (error) throw error
      return (data ?? []) as CategoryRow[]
    },
  })
}

/** Crea una categoría y devuelve la fila creada (para seleccionarla al instante). */
export function useCreateCategory() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ ...input, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      return data as CategoryRow
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.categories(user!.id) }),
  })
}

// Transactions ----------------------------------------------------
/** Flujo de dinero: entrada (ingresos) o salida (gastos/pagos). */
export type TransactionFlow = 'in' | 'out'

const FLOW_KINDS: Record<TransactionFlow, TransactionKind[]> = {
  in: ['income'],
  out: ['expense', 'debt_payment', 'card_payment'],
}

export interface TransactionFilters {
  from?: string
  to?: string
  kind?: TransactionKind
  /** Filtro alto nivel: Ingresos vs Gastos. Agrupa varios kinds. */
  flow?: TransactionFlow
  categoryId?: string
  accountId?: string
  cardId?: string
  /** Búsqueda libre por descripción (note). */
  search?: string
}

export function useTransactions(filters: TransactionFilters = {}) {
  const { user } = useAuth()
  return useQuery({
    queryKey: user
      ? qk.transactions(user.id, filters)
      : ['transactions', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
      if (filters.from) q = q.gte('date', filters.from)
      if (filters.to) q = q.lte('date', filters.to)
      if (filters.kind) q = q.eq('kind', filters.kind)
      if (filters.flow) q = q.in('kind', FLOW_KINDS[filters.flow])
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
      if (filters.accountId) {
        // cuenta origen o cuenta destino (transferencia)
        q = q.or(
          `account_id.eq.${filters.accountId},counterparty_account_id.eq.${filters.accountId}`,
        )
      }
      if (filters.cardId) q = q.eq('credit_card_id', filters.cardId)
      if (filters.search) q = q.ilike('note', `%${filters.search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as TransactionRow[]
    },
  })
}

/** Claves de filtro que viven en la URL (?flow=out&categoryId=…). */
const URL_FILTER_KEYS = [
  'from',
  'to',
  'flow',
  'categoryId',
  'accountId',
  'cardId',
  'search',
] as const

/**
 * Filtros de la página de transacciones SINCRONIZADOS con la URL: otras
 * páginas (dashboard) pueden enlazar a /transactions?flow=out&categoryId=X
 * y la vista llega ya filtrada. Navegar atrás restaura los filtros previos.
 */
export function useTransactionFilters(initial: TransactionFilters = {}) {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo<TransactionFilters>(() => {
    const f: TransactionFilters = { ...initial }
    for (const key of URL_FILTER_KEYS) {
      const v = searchParams.get(key)
      if (!v) continue
      if (key === 'flow') {
        if (v === 'in' || v === 'out') f.flow = v
      } else {
        f[key] = v
      }
    }
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const setFilter = useCallback(
    <K extends keyof TransactionFilters>(
      key: K,
      value: TransactionFilters[K],
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, String(value))
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setFilters = useCallback(
    (f: TransactionFilters) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const key of URL_FILTER_KEYS) {
            const v = f[key]
            if (v) next.set(key, String(v))
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const reset = useCallback(
    () => setFilters({}),
    [setFilters],
  )

  return { filters, setFilter, setFilters, reset }
}

function invalidateAfterTx(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: ['transactions', userId] })
  qc.invalidateQueries({ queryKey: qk.accounts(userId) })
  qc.invalidateQueries({ queryKey: qk.cards(userId) })
  qc.invalidateQueries({ queryKey: qk.debts(userId) })
  qc.invalidateQueries({ queryKey: qk.installments(userId) })
  qc.invalidateQueries({ queryKey: qk.recurring(userId) })
}

/**
 * Inserta la transacción y aplica su efecto sobre saldos de forma ATÓMICA
 * vía la RPC SQL `create_financial_transaction`. Devuelve el id creado.
 */
async function callCreateTransactionRpc(
  input: TransactionInput,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_financial_transaction', {
    p_kind: input.kind,
    p_amount: Number(input.amount),
    p_date: input.date,
    p_category_id: input.category_id ?? null,
    p_account_id: input.account_id ?? null,
    p_counterparty_account_id: input.counterparty_account_id ?? null,
    p_credit_card_id: input.credit_card_id ?? null,
    p_debt_id: input.debt_id ?? null,
    p_debt_installment_id: input.debt_installment_id ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw error
  return data as string
}

/**
 * Pago de deuda sin cuota explícita: si el monto coincide con la siguiente
 * cuota pendiente de esa deuda, la vincula para que quede marcada como pagada
 * (el progreso de la deuda se deriva de las cuotas). Si el monto difiere
 * (abono parcial/extra), no vincula ninguna.
 */
async function resolveInstallmentForDebtPayment(
  input: TransactionInput,
): Promise<string | null> {
  if (
    input.kind !== 'debt_payment' ||
    !input.debt_id ||
    input.debt_installment_id
  ) {
    return input.debt_installment_id ?? null
  }
  const { data, error } = await supabase
    .from('debt_installments')
    .select('id, amount')
    .eq('debt_id', input.debt_id)
    .in('status', ['pending', 'overdue'])
    .order('sequence', { ascending: true })
    .limit(1)
  if (error) return null
  const next = data?.[0]
  if (next && Math.abs(Number(next.amount) - Number(input.amount)) < 1) {
    return next.id as string
  }
  return null
}

export function useCreateTransaction() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      const installmentId = await resolveInstallmentForDebtPayment(input)
      await callCreateTransactionRpc({
        ...input,
        debt_installment_id: installmentId,
      })

      // Gasto con tarjeta a cuotas → genera el calendario de cuotas de tarjeta.
      // La RPC ya sumó el total a la deuda de la tarjeta; las cuotas son el plan
      // de pago futuro (cada pago bajará la deuda vía pay_installment).
      const count = input.installments_count ?? 0
      if (
        input.kind === 'expense' &&
        input.credit_card_id &&
        count > 1
      ) {
        const firstDue = toISODate(addMonths(fromISODate(input.date), 1))
        const rows = generateCardInstallments({
          userId: user!.id,
          creditCardId: input.credit_card_id,
          total: Number(input.amount),
          count,
          firstDueDate: firstDue,
          annualInterestRate: input.installment_has_interest
            ? input.installment_interest_rate ?? 0
            : 0,
        })
        if (rows.length > 0) {
          const { error } = await supabase.from('debt_installments').insert(rows)
          if (error) throw error
        }
      }
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}

/**
 * Edición de una transacción. Como el efecto sobre saldos ya se aplicó al
 * crearla y revertirlo con exactitud es complejo, editamos solo los campos
 * "descriptivos" (fecha, categoría, nota). Para cambiar montos o cuentas, el
 * flujo recomendado es borrar y recrear.
 */
export function useUpdateTransaction() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<Pick<TransactionRow, 'date' | 'category_id' | 'note'>>
    }) => {
      const { error } = await supabase
        .from('transactions')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}

/**
 * Borra la transacción REVIRTIENDO su efecto sobre saldos vía la RPC
 * `delete_financial_transaction` (cuenta, deuda, cuota y recomputo de
 * tarjeta). Esto hace seguro el flujo "editar monto = borrar y recrear".
 */
export function useDeleteTransaction() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_financial_transaction', {
        p_tx_id: id,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}

// Recurring transactions ------------------------------------------
export function useRecurringTransactions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.recurring(user.id) : ['recurring', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('user_id', user!.id)
        .order('next_occurrence_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as RecurringTransactionRow[]
    },
  })
}

export function useCreateRecurring() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecurringTransactionInput) => {
      const { error } = await supabase
        .from('recurring_transactions')
        .insert({ ...input, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring(user!.id) }),
  })
}

export function useDeleteRecurring() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.recurring(user!.id) }),
  })
}

export function useMaterializeRecurring() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (template: RecurringTransactionRow) => {
      const input: TransactionInput = {
        date: template.next_occurrence_date,
        amount: Number(template.amount),
        kind: template.kind,
        category_id: template.category_id,
        account_id: template.account_id,
        counterparty_account_id: null,
        credit_card_id: template.credit_card_id,
        debt_id: template.debt_id,
        debt_installment_id: null,
        note: `Recurrente: ${template.name}`,
      }
      // Inserta + aplica efecto atómicamente; luego marca el origen recurrente.
      const txId = await callCreateTransactionRpc(input)
      await supabase
        .from('transactions')
        .update({ recurrence_id: template.id })
        .eq('id', txId)

      const next = advanceNextOccurrence(template)
      await supabase
        .from('recurring_transactions')
        .update({ next_occurrence_date: next })
        .eq('id', template.id)
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}
