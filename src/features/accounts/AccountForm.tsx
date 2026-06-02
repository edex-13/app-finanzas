import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MoneyInput } from '@/components/common/MoneyInput'
import { ColorPicker } from '@/components/ui/color-picker'
import { FormField } from '@/components/common/FormField'
import { accountSchema, type AccountInput } from '@/lib/validations'
import type { AccountRow } from '@/types/database'

interface Props {
  initial?: AccountRow
  onSubmit: (values: AccountInput) => Promise<void> | void
  onCancel?: () => void
  submitLabel?: string
}

const typeOptions: { value: AccountInput['type']; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank', label: 'Cuenta bancaria' },
  { value: 'digital_wallet', label: 'Billetera digital' },
  { value: 'other', label: 'Otro' },
]

export function AccountForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: Props) {
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: initial?.name ?? '',
      type: initial?.type ?? 'bank',
      balance: Number(initial?.balance ?? 0),
      institution: initial?.institution ?? '',
      color: initial?.color ?? '',
      notes: initial?.notes ?? '',
    },
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (err) {
      toast.error((err as Error).message ?? 'Error al guardar')
    }
  })

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        label="Nombre"
        htmlFor="name"
        error={form.formState.errors.name?.message}
      >
        <Input id="name" {...form.register('name')} placeholder="Cuenta Bancolombia" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Tipo"
          error={form.formState.errors.type?.message as string | undefined}
        >
          <Select
            value={form.watch('type')}
            onValueChange={(v) =>
              form.setValue('type', v as AccountInput['type'], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Saldo actual"
          error={form.formState.errors.balance?.message}
        >
          <MoneyInput
            value={form.watch('balance')}
            onChange={(v) =>
              form.setValue('balance', v, { shouldValidate: true })
            }
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Institución" htmlFor="institution">
          <Input
            id="institution"
            {...form.register('institution')}
            placeholder="Banco / proveedor"
          />
        </FormField>
        <FormField label="Color" htmlFor="color">
          <ColorPicker
            id="color"
            value={form.watch('color')}
            onChange={(hex) => form.setValue('color', hex, { shouldValidate: true })}
          />
        </FormField>
      </div>

      <FormField label="Notas" htmlFor="notes">
        <Textarea id="notes" rows={2} {...form.register('notes')} />
      </FormField>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
