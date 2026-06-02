import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/common/FormField'
import { supabase } from '@/lib/supabase'
import { loginSchema, type LoginInput } from '@/lib/validations'
import { useAuth } from './AuthProvider'
import { paths } from '@/routes/paths'

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
    <div className="grid min-h-full place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bienvenido de vuelta a Finanzas
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
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
                {...form.register('password')}
              />
            </FormField>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Ingresando…' : 'Entrar'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{' '}
              <Link
                to={paths.register}
                className="font-medium text-primary hover:underline"
              >
                Regístrate
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
