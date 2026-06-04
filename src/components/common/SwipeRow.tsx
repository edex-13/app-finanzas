import { useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SwipeAction {
  icon: ReactNode
  /** Clase de fondo (token). Coral para borrar, secondary para editar. */
  bgClass: string
  onClick: () => void
  label: string
}

interface Props {
  children: ReactNode
  /** Acción al deslizar a la izquierda (la más a la derecha visualmente). */
  onDelete?: () => void
  onEdit?: () => void
  /** Acciones personalizadas (sobrescriben edit/delete). */
  actions?: SwipeAction[]
  className?: string
}

const ACTION_WIDTH = 72

/**
 * Fila deslizable (mobile-first): al arrastrar a la izquierda revela acciones
 * (editar / borrar). Click fuera o soltar sin pasar el umbral la cierra.
 * En desktop el drag también funciona pero las acciones suelen estar visibles
 * igualmente en la fila; esto es un extra táctil para móvil.
 */
export function SwipeRow({
  children,
  onDelete,
  onEdit,
  actions,
  className,
}: Props) {
  const x = useMotionValue(0)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const resolved: SwipeAction[] =
    actions ??
    [
      onEdit && {
        icon: <Pencil className="h-5 w-5" />,
        bgClass: 'bg-secondary text-foreground',
        onClick: onEdit,
        label: 'Editar',
      },
      onDelete && {
        icon: <Trash2 className="h-5 w-5" />,
        bgClass: 'bg-primary text-primary-foreground',
        onClick: onDelete,
        label: 'Eliminar',
      },
    ].filter(Boolean) as SwipeAction[]

  if (resolved.length === 0) {
    return <div className={className}>{children}</div>
  }

  const revealWidth = resolved.length * ACTION_WIDTH

  const close = () => {
    animate(x, 0, { type: 'spring', stiffness: 500, damping: 40 })
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Acciones detrás de la fila */}
      <div className="absolute inset-y-0 right-0 flex">
        {resolved.map((a) => (
          <button
            key={a.label}
            type="button"
            aria-label={a.label}
            onClick={() => {
              a.onClick()
              close()
            }}
            style={{ width: ACTION_WIDTH }}
            className={cn(
              'flex items-center justify-center transition-opacity',
              a.bgClass,
            )}
          >
            {a.icon}
          </button>
        ))}
      </div>

      {/* Contenido arrastrable */}
      <motion.div
        drag="x"
        style={{ x }}
        dragConstraints={{ left: -revealWidth, right: 0 }}
        dragElastic={0.08}
        onDragEnd={(_, info) => {
          const shouldOpen = info.offset.x < -revealWidth / 2 || info.velocity.x < -300
          if (shouldOpen) {
            animate(x, -revealWidth, { type: 'spring', stiffness: 500, damping: 40 })
            setOpen(true)
          } else {
            close()
          }
        }}
        onClick={() => open && close()}
        className="relative bg-card"
      >
        {children}
      </motion.div>
    </div>
  )
}
