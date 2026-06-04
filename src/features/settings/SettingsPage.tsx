import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Check, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { settingsSchema, type SettingsInput } from '@/lib/validations'
import { cn } from '@/lib/utils'
import { useSettings, useUpdateSettings } from './hooks'
import { useAuth } from '@/features/auth/AuthProvider'
import { paths } from '@/routes/paths'

// Input/Select como píldora suave (sin caja con borde duro) — patrón MonAi.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Opciones de tema como chips seleccionables (en vez de un Select crudo).
const THEME_OPTIONS: { value: SettingsInput['theme']; label: string; emoji: string }[] = [
  { value: 'system', label: 'Sistema', emoji: '🖥️' },
  { value: 'light', label: 'Claro', emoji: '☀️' },
  { value: 'dark', label: 'Oscuro', emoji: '🌙' },
]

export function SettingsPage() {
  const { data } = useSettings()
  const update = useUpdateSettings()
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      currency: 'COP',
      locale: 'es-CO',
      alert_days_before_payment: 3,
      theme: 'system',
    },
  })

  useEffect(() => {
    if (data) {
      form.reset({
        currency: data.currency,
        locale: data.locale,
        alert_days_before_payment: data.alert_days_before_payment,
        theme: (data.theme as 'light' | 'dark' | 'system') ?? 'system',
      })
    }
  }, [data, form])

  const theme = form.watch('theme')

  return (
    <div>
      <PageHeader title="Ajustes" description="Tu cuenta y preferencias." />

      <div className="space-y-6">
        {/* Sección Cuenta */}
        <section className="rounded-3xl bg-card p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Cuenta
          </p>
          <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pastel-lavender text-lg">
              👤
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Sesión activa</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={async () => {
              await signOut()
              navigate(paths.login, { replace: true })
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </section>

        {/* Sección Preferencias */}
        <section className="rounded-3xl bg-card p-5">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Preferencias
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Moneda, idioma y alertas.
          </p>

          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              await update.mutateAsync(values)
              toast.success('Preferencias guardadas')
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Moneda" htmlFor="currency">
                <Input
                  id="currency"
                  maxLength={3}
                  className={pillInput}
                  {...form.register('currency')}
                />
              </FormField>
              <FormField label="Locale" htmlFor="locale">
                <Input
                  id="locale"
                  className={pillInput}
                  {...form.register('locale')}
                />
              </FormField>
            </div>

            {/* Días de aviso: número grande protagonista en su píldora. */}
            <FormField
              label="Días de aviso antes de pago"
              htmlFor="alert_days_before_payment"
            >
              <Input
                id="alert_days_before_payment"
                type="number"
                min={0}
                max={30}
                className={pillInput}
                {...form.register('alert_days_before_payment', {
                  valueAsNumber: true,
                })}
              />
            </FormField>

            {/* Tema: chips seleccionables con emoji. */}
            <div>
              <p className="mb-2 text-sm font-semibold">Tema</p>
              <div className="flex gap-2">
                {THEME_OPTIONS.map((opt) => {
                  const active = theme === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => form.setValue('theme', opt.value)}
                      className={cn(
                        'flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3 text-sm font-bold transition-colors active:scale-[0.97]',
                        active
                          ? 'bg-foreground text-background'
                          : 'bg-secondary text-foreground',
                      )}
                    >
                      <span>{opt.emoji}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              <Check className="mr-2 h-4 w-4" />
              Guardar
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
