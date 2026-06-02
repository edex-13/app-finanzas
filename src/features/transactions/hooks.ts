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
  RecurringTransactionInput,
  TransactionInput,
} from '@/lib/validations'
import { advanceNextOccurrence } from '@/lib/recurrence'

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

// Transactions ----------------------------------------------------
export interface TransactionFilters {
  from?: string
  to?: string
  kind?: TransactionKind
  categoryId?: string
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
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as TransactionRow[]
    },
  })
}

function invalidateAfterTx(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: ['transactions', userId] })
  qc.invalidateQueries({ queryKey: qk.accounts(userId) })
  qc.invalidateQueries({ queryKey: qk.cards(userId) })
  qc.invalidateQueries({ queryKey: qk.debts(userId) })
  qc.invalidateQueries({ queryKey: qk.installments(userId) })
  qc.invalidateQueries({ queryKey: qk.recurring(userId) })
}

async function applyBalanceEffect(input: TransactionInput, userId: string) {
  // Ajusta saldos atómicamente (best-effort; sin RPC). Validación liviana.
  const amount = Number(input.amount)
  const sign = input.kind === 'income' ? 1 : -1

  if (input.account_id && (input.kind === 'income' || input.kind === 'expense')) {
    const { data: acc } = await supabase
      .from('accounts')
      .select('id,balance')
      .eq('id', input.account_id)
      .single()
    if (acc) {
      await supabase
        .from('accounts')
        .update({ balance: Number(acc.balance) + sign * amount })
        .eq('id', acc.id)
    }
  }

  if (input.kind === 'card_payment' && input.credit_card_id) {
    // Baja deuda de tarjeta
    const { data: card } = await supabase
      .from('credit_cards')
      .select('id,current_debt')
      .eq('id', input.credit_card_id)
      .single()
    if (card) {
      await supabase
        .from('credit_cards')
        .update({
          current_debt: Math.max(0, Number(card.current_debt) - amount),
        })
        .eq('id', card.id)
    }
    if (input.account_id) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('id,balance')
        .eq('id', input.account_id)
        .single()
      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) - amount })
          .eq('id', acc.id)
      }
    }
  }

  if (input.kind === 'debt_payment' && input.debt_id) {
    const { data: debt } = await supabase
      .from('debts')
      .select('id,remaining_balance,remaining_installments')
      .eq('id', input.debt_id)
      .single()
    if (debt) {
      await supabase
        .from('debts')
        .update({
          remaining_balance: Math.max(
            0,
            Number(debt.remaining_balance) - amount,
          ),
          remaining_installments:
            (debt.remaining_installments ?? 0) > 0
              ? (debt.remaining_installments ?? 0) - 1
              : 0,
        })
        .eq('id', debt.id)
    }
    if (input.debt_installment_id) {
      await supabase
        .from('debt_installments')
        .update({ status: 'paid' })
        .eq('id', input.debt_installment_id)
    }
    if (input.account_id) {
      const { data: acc } = await supabase
        .from('accounts')
        .select('id,balance')
        .eq('id', input.account_id)
        .single()
      if (acc) {
        await supabase
          .from('accounts')
          .update({ balance: Number(acc.balance) - amount })
          .eq('id', acc.id)
      }
    }
  }

  // Compra "expense" con tarjeta: aumenta deuda de tarjeta
  if (input.kind === 'expense' && input.credit_card_id) {
    const { data: card } = await supabase
      .from('credit_cards')
      .select('id,current_debt')
      .eq('id', input.credit_card_id)
      .single()
    if (card) {
      await supabase
        .from('credit_cards')
        .update({ current_debt: Number(card.current_debt) + amount })
        .eq('id', card.id)
    }
  }
  // user_id usado por sig consistente
  void userId
}

export function useCreateTransaction() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TransactionInput) => {
      const { error } = await supabase
        .from('transactions')
        .insert({ ...input, user_id: user!.id })
      if (error) throw error
      await applyBalanceEffect(input, user!.id)
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}

export function useDeleteTransaction() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
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
        credit_card_id: template.credit_card_id,
        debt_id: template.debt_id,
        debt_installment_id: null,
        note: `Recurrente: ${template.name}`,
      }
      const { error } = await supabase
        .from('transactions')
        .insert({
          ...input,
          user_id: user!.id,
          recurrence_id: template.id,
        })
      if (error) throw error
      await applyBalanceEffect(input, user!.id)

      const next = advanceNextOccurrence(template)
      await supabase
        .from('recurring_transactions')
        .update({ next_occurrence_date: next })
        .eq('id', template.id)
    },
    onSuccess: () => invalidateAfterTx(qc, user!.id),
  })
}
