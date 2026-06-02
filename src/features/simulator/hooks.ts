import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { PurchaseSimulationRow } from '@/types/database'

export function usePurchaseSimulations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.simulations(user.id) : ['simulations', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_simulations')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as PurchaseSimulationRow[]
    },
  })
}

export function useSaveSimulation() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<PurchaseSimulationRow, 'id' | 'created_at' | 'user_id'>) => {
      const { error } = await supabase
        .from('purchase_simulations')
        .insert({ ...input, user_id: user!.id })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.simulations(user!.id) }),
  })
}
