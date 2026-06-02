import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/query-keys'
import { useAuth } from '@/features/auth/AuthProvider'
import type { SettingsRow } from '@/types/database'
import type { SettingsInput } from '@/lib/validations'

export function useSettings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: user ? qk.settings(user.id) : ['settings', 'anon'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as SettingsRow | null
    },
  })
}

export function useUpdateSettings() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SettingsInput) => {
      const { error } = await supabase
        .from('settings')
        .update(input)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings(user!.id) }),
  })
}
