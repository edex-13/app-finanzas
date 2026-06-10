import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { DebtInstallmentRow, DebtRow } from '@/types/database'
import type { DebtInput } from '@/lib/validations'
import { generateDebtInstallments } from '@/lib/financial-calculations'

export function useDebts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.debts(user.id) : ['debts', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as DebtRow[]
    },
  })
}

export function useDebtInstallments() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.installments(user.id) : ['installments', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*')
        .eq('user_id', user!.id)
        .order('due_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as DebtInstallmentRow[]
    },
  })
}

/** Cuotas de una deuda concreta (para la vista de detalle). */
export function useInstallmentsByDebt(debtId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey:
      user && debtId
        ? qk.installmentsByDebt(user.id, debtId)
        : ['debt_installments', 'anon'],
    enabled: !!user && !!debtId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*')
        .eq('user_id', user!.id)
        .eq('debt_id', debtId!)
        .order('sequence', { ascending: true })
      if (error) throw error
      return (data ?? []) as DebtInstallmentRow[]
    },
  })
}

function invalidateAfterInstallment(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
) {
  qc.invalidateQueries({ queryKey: ['debt_installments', userId] })
  qc.invalidateQueries({ queryKey: qk.debts(userId) })
  qc.invalidateQueries({ queryKey: qk.accounts(userId) })
  qc.invalidateQueries({ queryKey: qk.cards(userId) })
  qc.invalidateQueries({ queryKey: ['transactions', userId] })
}

/** Paga una cuota atómicamente vía RPC pay_installment. */
export function usePayInstallment() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      installmentId,
      accountId,
      payWithCardId,
      date,
    }: {
      installmentId: string
      accountId?: string | null
      payWithCardId?: string | null
      date?: string
    }) => {
      const { error } = await supabase.rpc('pay_installment', {
        p_installment_id: installmentId,
        p_account_id: accountId ?? null,
        p_date: date ?? null,
        p_pay_with_card_id: payWithCardId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => invalidateAfterInstallment(qc, user!.id),
  })
}

/** Marca como vencidas las cuotas pendientes con fecha pasada. */
export function useMarkOverdueInstallments() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_overdue_installments', {})
      if (error) throw error
    },
    onSuccess: () => invalidateAfterInstallment(qc, user!.id),
  })
}

export function useCreateDebt() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DebtInput) => {
      const { data, error } = await supabase
        .from('debts')
        .insert({ ...input, user_id: user!.id })
        .select()
        .single()
      if (error) throw error
      const created = data as DebtRow

      // Auto-genera cuotas si tenemos cómo
      if (
        created.next_payment_date &&
        created.remaining_installments &&
        created.approx_installment_amount > 0
      ) {
        const installments = generateDebtInstallments(created)
        if (installments.length > 0) {
          const { error: instErr } = await supabase
            .from('debt_installments')
            .insert(installments)
          if (instErr) throw instErr
        }
      }
      return created
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.debts(user!.id) })
      qc.invalidateQueries({ queryKey: qk.installments(user!.id) })
    },
  })
}

export function useUpdateDebt() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: DebtInput }) => {
      const { error } = await supabase
        .from('debts')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.debts(user!.id) }),
  })
}

export function useDeleteDebt() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('debts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.debts(user!.id) })
      qc.invalidateQueries({ queryKey: qk.installments(user!.id) })
    },
  })
}
