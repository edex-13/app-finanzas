import * as React from 'react'
import { Check, Plus } from 'lucide-react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { cn } from '@/lib/utils'

/**
 * Selector de color propio, minimalista (estilo MonAi).
 * - Fila de swatches pastel apagados predefinidos (la paleta de marca).
 * - Botón "+" que abre un popover con un picker HSV (react-colorful) + campo
 *   hex, en vez del feo <input type="color"> nativo del navegador.
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
    const [open, setOpen] = React.useState(false)
    const popRef = React.useRef<HTMLDivElement>(null)

    // Cierra el popover al hacer click fuera.
    React.useEffect(() => {
      if (!open) return
      function onDoc(e: MouseEvent) {
        if (popRef.current && !popRef.current.contains(e.target as Node)) {
          setOpen(false)
        }
      }
      document.addEventListener('mousedown', onDoc)
      return () => document.removeEventListener('mousedown', onDoc)
    }, [open])

    return (
      <div
        ref={ref}
        id={id}
        className={cn('flex flex-wrap items-center gap-2.5', className)}
      >
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

        {/* Color libre vía popover con react-colorful */}
        <div ref={popRef} className="relative">
          <button
            type="button"
            aria-label="Color personalizado"
            title="Color personalizado"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={isCustom ? { backgroundColor: current } : undefined}
            className={cn(
              'grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-background transition-transform active:scale-90',
              isCustom
                ? 'ring-2 ring-foreground'
                : 'bg-secondary text-muted-foreground ring-1 ring-dashed ring-border',
            )}
          >
            {isCustom ? (
              <Check className="h-4 w-4 text-black/70" strokeWidth={3} />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>

          {open && (
            <div className="custom-color-pop absolute left-0 top-11 z-50 w-[212px] space-y-3 rounded-2xl border border-border bg-popover p-3 shadow-soft">
              <HexColorPicker
                color={current || '#b7aed0'}
                onChange={(hex) => onChange?.(hex)}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-muted-foreground">#</span>
                <HexColorInput
                  color={current || '#b7aed0'}
                  onChange={(hex) => onChange?.(hex)}
                  prefixed={false}
                  className="h-10 w-full rounded-xl border border-border bg-secondary px-3 text-sm font-bold uppercase tnum outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  },
)
ColorPicker.displayName = 'ColorPicker'
