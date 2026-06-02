import { createClient } from '@supabase/supabase-js'
import { assertSupabaseEnv, env } from './env'

assertSupabaseEnv()

export const supabase = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})
