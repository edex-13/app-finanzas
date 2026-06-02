export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  appName: (import.meta.env.VITE_APP_NAME as string) ?? 'Finanzas',
  defaultCurrency: (import.meta.env.VITE_DEFAULT_CURRENCY as string) ?? 'COP',
  defaultLocale: (import.meta.env.VITE_DEFAULT_LOCALE as string) ?? 'es-CO',
}

export function assertSupabaseEnv() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      'Faltan variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. Crea un archivo .env.local basado en .env.example.',
    )
  }
}
