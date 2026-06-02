import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { AccountRow } from '@/types/database'
import type { AccountInput } from '@/lib/validations'

export function useAccounts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.accounts(user.id) : ['accounts', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as AccountRow[]
    },
  })
}

export function useCreateAccount() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AccountInput) => {
      const { error } = await supabase
        .from('accounts')
        .insert({ ...input, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts(user!.id) }),
  })
}

export function useUpdateAccount() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AccountInput }) => {
      const { error } = await supabase
        .from('accounts')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts(user!.id) }),
  })
}

export function useDeleteAccount() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.accounts(user!.id) }),
  })
}
