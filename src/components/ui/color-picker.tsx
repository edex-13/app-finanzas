import * as React from 'react'
import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Selector de color propio, minimalista.
 * - Fila de swatches pastel apagados predefinidos (la paleta de marca).
 * - Botón "+" que abre el <input type="color"> nativo para un tono libre.
 *
 * Controlado: recibe `value` (hex como "#aabbcc") y notifica con `onChange`.
 * RHF-friendly — basta con { value, onChange } de un Controller/register.
 */

// Paleta pastel apagada (mute). Coincide con las CSS vars --pastel-* en index.css.
export const PASTEL_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Lavanda', hex: '#b7aed0' },
  { name: 'Menta', hex: '#9fc7b4' },
  { name: 'Arena', hex: '#e0bfa8' },
  { name: 'Azul', hex: '#a6bfd0' },
  { name: 'Rosa', hex: '#d9aeb8' },
  { name: 'Terracota', hex: '#c98a7d' },
  { name: 'Mostaza', hex: '#c9a24b' },
  { name: 'Oliva', hex: '#9ca37e' },
]

export interface ColorPickerProps {
  value?: string | null
  onChange?: (hex: string) => void
  id?: string
  className?: string
}

function normalize(hex?: string | null) {
  return (hex ?? '').trim().toLowerCase()
}

export const ColorPicker = React.forwardRef<HTMLDivElement, ColorPickerProps>(
  ({ value, onChange, id, className }, ref) => {
    const current = normalize(value)
    const isCustom =
      !!current && !PASTEL_SWATCHES.some((s) => s.hex.toLowerCase() === current)
    const nativeRef = React.useRef<HTMLInputElement>(null)

    return (
      <div ref={ref} id={id} className={cn('flex flex-wrap items-center gap-2.5', className)}>
        {PASTEL_SWATCHES.map((s) => {
          const selected = current === s.hex.toLowerCase()
          return (
            <button
              key={s.hex}
              type="button"
              aria-label={s.name}
              aria-pressed={selected}
              title={s.name}
              onClick={() => onChange?.(s.hex)}
              style={{ backgroundColor: s.hex }}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform active:scale-90',
                selected ? 'ring-2 ring-foreground' : 'ring-1 ring-border',
              )}
            >
              {selected && <Check className="h-4 w-4 text-black/70" strokeWidth={3} />}
            </button>
          )
        })}

        {/* Color libre vía picker nativo */}
        <button
          type="button"
          aria-label="Color personalizado"
          title="Color personalizado"
          onClick={() => nativeRef.current?.click()}
          style={isCustom ? { backgroundColor: current } : undefined}
          className={cn(
            'relative grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform active:scale-90',
            isCustom ? 'ring-2 ring-foreground' : 'ring-1 ring-dashed ring-border bg-muted text-muted-foreground',
          )}
        >
          {isCustom ? (
            <Check className="h-4 w-4 text-black/70" strokeWidth={3} />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <input
            ref={nativeRef}
            type="color"
            value={current || '#b7aed0'}
            onChange={(e) => onChange?.(e.target.value)}
            className="absolute inset-0 h-px w-px opacity-0"
            tabIndex={-1}
          />
        </button>
      </div>
    )
  },
)
ColorPicker.displayName = 'ColorPicker'
