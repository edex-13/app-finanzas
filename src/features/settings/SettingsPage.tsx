import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from '@/components/common/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { settingsSchema, type SettingsInput } from '@/lib/validations'
import { useSettings, useUpdateSettings } from './hooks'
import { useAuth } from '@/features/auth/AuthProvider'
import { paths } from '@/routes/paths'

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

  return (
    <div>
      <PageHeader title="Ajustes" description="Tu cuenta y preferencias." />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cuenta</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut()
                navigate(paths.login, { replace: true })
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preferencias</CardTitle>
            <CardDescription>
              Moneda, idioma y alertas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
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
                    {...form.register('currency')}
                  />
                </FormField>
                <FormField label="Locale" htmlFor="locale">
                  <Input id="locale" {...form.register('locale')} />
                </FormField>
              </div>
              <FormField
                label="Días de aviso antes de pago"
                htmlFor="alert_days_before_payment"
              >
                <Input
                  id="alert_days_before_payment"
                  type="number"
                  min={0}
                  max={30}
                  {...form.register('alert_days_before_payment', {
                    valueAsNumber: true,
                  })}
                />
              </FormField>
              <FormField label="Tema">
                <Select
                  value={form.watch('theme')}
                  onValueChange={(v) =>
                    form.setValue('theme', v as SettingsInput['theme'])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Oscuro</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex justify-end">
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Guardar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
