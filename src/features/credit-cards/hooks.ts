import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { CreditCardRow } from '@/types/database'
import type { CreditCardInput } from '@/lib/validations'

export function useCreditCards() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.cards(user.id) : ['cards', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_cards')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CreditCardRow[]
    },
  })
}

export function useCreateCard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreditCardInput) => {
      // current_debt es derivado; al crear arranca igual al saldo de apertura.
      const { error } = await supabase
        .from('credit_cards')
        .insert({
          ...input,
          current_debt: input.opening_balance,
          user_id: user!.id,
        })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cards(user!.id) }),
  })
}

export function useUpdateCard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: CreditCardInput
    }) => {
      // El saldo de apertura solo se fija al crear; la deuda es derivada y
      // nunca se edita directo.
      const rest: Partial<CreditCardInput> = { ...input }
      delete rest.opening_balance
      const { error } = await supabase
        .from('credit_cards')
        .update(rest)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cards(user!.id) }),
  })
}

export function useDeleteCard() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('credit_cards')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cards(user!.id) }),
  })
}
