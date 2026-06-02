import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/common/FormField'
import { supabase } from '@/lib/supabase'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { paths } from '@/routes/paths'

export function RegisterPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      confirm_password: '',
    },
  })

  async function onSubmit(values: RegisterInput) {
    setSubmitting(true)
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { full_name: values.full_name } },
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message ?? 'No pudimos crear tu cuenta')
      return
    }
    toast.success(
      'Cuenta creada. Si tu proyecto Supabase requiere confirmación, revisa tu email.',
    )
    navigate(paths.login, { replace: true })
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Empieza a controlar tus finanzas
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
            <FormField
              label="Nombre"
              htmlFor="full_name"
              error={form.formState.errors.full_name?.message}
            >
              <Input
                id="full_name"
                autoComplete="name"
                {...form.register('full_name')}
              />
            </FormField>
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
                autoComplete="new-password"
                {...form.register('password')}
              />
            </FormField>
            <FormField
              label="Confirma contraseña"
              htmlFor="confirm_password"
              error={form.formState.errors.confirm_password?.message}
            >
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                {...form.register('confirm_password')}
              />
            </FormField>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Creando…' : 'Crear cuenta'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <Link
                to={paths.login}
                className="font-medium text-primary hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
