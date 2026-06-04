import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/common/FormField'
import { supabase } from '@/lib/supabase'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { useAuth } from './AuthProvider'
import { paths } from '@/routes/paths'

// Input como píldora suave (sin caja con borde duro) — patrón MonAi.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold placeholder:text-muted-foreground placeholder:font-medium focus-visible:ring-2 focus-visible:ring-ring/40'

export function LoginPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  if (!loading && user) {
    const from = (location.state as { from?: Location })?.from?.pathname
    return <Navigate to={from ?? paths.dashboard} replace />
  }

  async function onSubmit(values: LoginInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword(values)
    setSubmitting(false)
    if (error) {
      toast.error(error.message ?? 'No pudimos iniciar sesión')
      return
    }
    toast.success('Bienvenido')
    navigate(paths.dashboard, { replace: true })
  }

  return (
    <div className="safe-pt safe-pb grid min-h-full place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* Branding MonAi: marca amigable y grande, sin degradados. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-20 w-20 place-items-center rounded-3xl bg-primary text-4xl">
            🪙
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
            Hola de nuevo
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inicia sesión y sigue al control de tu plata.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <FormField
            label="Email"
            htmlFor="email"
            error={form.formState.errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              className={pillInput}
              {...form.register('email')}
            />
          </FormField>
          <FormField
            label="Contraseña"
            htmlFor="password"
            error={form.formState.errors.password?.message}
          >
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              className={pillInput}
              {...form.register('password')}
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? 'Ingresando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link
            to={paths.register}
            className="font-bold text-primary hover:underline"
          >
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
