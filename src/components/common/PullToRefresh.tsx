import { useRef, useState, type ReactNode } from 'react'
import { motion, useMotionValue, animate, useTransform } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface Props {
  children: ReactNode
  onRefresh: () => Promise<unknown> | void
  /** Distancia en px que hay que tirar para disparar el refresh. */
  threshold?: number
  className?: string
}

/**
 * Pull-to-refresh táctil (mobile-first). Solo activa el gesto cuando el scroll
 * está arriba del todo. Al soltar pasando el umbral, ejecuta onRefresh y muestra
 * un spinner pastel mientras resuelve. No interfiere con el scroll normal.
 */
export function PullToRefresh({
  children,
  onRefresh,
  threshold = 72,
  className,
}: Props) {
  const y = useMotionValue(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const indicatorOpacity = useTransform(y, [0, threshold], [0, 1])
  const indicatorRotate = useTransform(y, [0, threshold * 2], [0, 360])

  const atTop = () => (scrollRef.current?.scrollTop ?? 0) <= 0

  const onTouchStart = (e: React.TouchEvent) => {
    if (atTop() && !refreshing) startY.current = e.touches[0].clientY
    else startY.current = null
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0 && atTop()) {
      // resistencia: el indicador se mueve más lento que el dedo
      y.set(Math.min(delta * 0.5, threshold * 1.6))
    }
  }

  const onTouchEnd = async () => {
    if (startY.current === null) return
    const pulled = y.get()
    startY.current = null
    if (pulled >= threshold && !refreshing) {
      setRefreshing(true)
      animate(y, threshold, { type: 'spring', stiffness: 400, damping: 40 })
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        animate(y, 0, { type: 'spring', stiffness: 400, damping: 40 })
      }
    } else {
      animate(y, 0, { type: 'spring', stiffness: 400, damping: 40 })
    }
  }

  return (
    <div
      ref={scrollRef}
      className={className}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Indicador */}
      <motion.div
        style={{ opacity: indicatorOpacity, height: y }}
        className="flex items-end justify-center overflow-hidden"
      >
        <motion.div
          style={{ rotate: refreshing ? undefined : indicatorRotate }}
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground"
        >
          <Loader2 className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </motion.div>
      </motion.div>

      <motion.div style={{ y: refreshing ? 0 : undefined }}>{children}</motion.div>
    </div>
  )
}
