import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ProfileRow } from '@/types/database'

export function useProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.profile(user.id) : ['profile', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as ProfileRow | null
    },
  })
}

export function useCompleteOnboarding() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      if (user) qc.invalidateQueries({ queryKey: qk.profile(user.id) })
    },
  })
}
