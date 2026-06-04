import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/common/FormField'
import { supabase } from '@/lib/supabase'
import { registerSchema, type RegisterInput } from '@/lib/validations'
import { paths } from '@/routes/paths'

// Input como píldora suave (sin caja con borde duro) — patrón MonAi.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold placeholder:text-muted-foreground placeholder:font-medium focus-visible:ring-2 focus-visible:ring-ring/40'

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
    <div className="safe-pt safe-pb grid min-h-full place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        {/* Branding MonAi: marca amigable y grande, sin degradados. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="grid h-20 w-20 place-items-center rounded-3xl bg-primary text-4xl">
            🪙
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
            Crea tu cuenta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Empieza a controlar tus finanzas hoy.
          </p>
        </div>

        <form
          className="space-y-5"
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
              placeholder="¿Cómo te llamas?"
              className={pillInput}
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
              autoComplete="new-password"
              placeholder="••••••••"
              className={pillInput}
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
              placeholder="••••••••"
              className={pillInput}
              {...form.register('confirm_password')}
            />
          </FormField>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? 'Creando…' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link
            to={paths.login}
            className="font-bold text-primary hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
