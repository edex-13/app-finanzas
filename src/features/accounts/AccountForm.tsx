import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Wallet } from 'lucide-react'
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

// Trigger de Select como píldora suave (sin caja con borde duro).
const pillTrigger =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus:ring-2 focus:ring-ring/40 focus:ring-offset-0'

// Input/MoneyInput como píldora suave.
const pillInput =
  'h-12 rounded-2xl border-0 bg-secondary px-4 text-base font-bold focus-visible:ring-2 focus-visible:ring-ring/40'

// Textarea como píldora suave.
const pillTextarea =
  'rounded-2xl border-0 bg-secondary px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-ring/40'

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

  // Color elegido en vivo (refleja la selección del ColorPicker).
  const accentColor = form.watch('color') || 'hsl(var(--primary))'
  const previewName = form.watch('name')?.trim()

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
      {/* Preview en vivo: el acento se pinta con el color elegido. */}
      <div
        className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
        style={{ borderLeft: `4px solid ${accentColor}` }}
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: accentColor }}
        >
          <Wallet className="h-5 w-5 text-black/70" />
        </span>
        <p className="truncate text-sm font-bold">
          {previewName || 'Nueva cuenta'}
        </p>
      </div>

      {/* Saldo: número protagonista, sin caja. Solo se fija AL CREAR; después
          se mueve únicamente con los movimientos (o un Ajuste). */}
      {!initial ? (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            Saldo inicial
          </p>
          <MoneyInput
            value={form.watch('balance')}
            onChange={(v) =>
              form.setValue('balance', v, { shouldValidate: true })
            }
            className="h-auto rounded-none border-0 bg-transparent px-0 text-4xl font-extrabold tnum placeholder:text-muted-foreground/40 focus-visible:ring-0"
          />
          {form.formState.errors.balance?.message && (
            <p className="text-xs text-destructive">
              {form.formState.errors.balance.message}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">
            Saldo actual
          </p>
          <p className="text-4xl font-extrabold tnum">
            {new Intl.NumberFormat('es-CO', {
              style: 'currency',
              currency: 'COP',
              maximumFractionDigits: 0,
            }).format(Number(initial.balance))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se mueve con tus transacciones. Para corregirlo, registra un
            movimiento de tipo «Ajuste».
          </p>
        </div>
      )}

      <FormField
        label="Nombre"
        htmlFor="name"
        error={form.formState.errors.name?.message}
      >
        <Input
          id="name"
          {...form.register('name')}
          placeholder="Cuenta Bancolombia"
          className={pillInput}
        />
      </FormField>

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
          <SelectTrigger className={pillTrigger}>
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

      <FormField label="Institución" htmlFor="institution">
        <Input
          id="institution"
          {...form.register('institution')}
          placeholder="Banco / proveedor"
          className={pillInput}
        />
      </FormField>

      <FormField label="Color" htmlFor="color">
        <ColorPicker
          id="color"
          value={form.watch('color')}
          onChange={(hex) => form.setValue('color', hex, { shouldValidate: true })}
        />
      </FormField>

      <FormField label="Notas" htmlFor="notes">
        <Textarea
          id="notes"
          rows={2}
          {...form.register('notes')}
          className={pillTextarea}
        />
      </FormField>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full sm:w-auto"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
