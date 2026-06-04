import {
  ArrowLeftRight,
  Briefcase,
  Car,
  CreditCard,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  Plug,
  Repeat,
  ShoppingBag,
  Tag,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/**
 * Mapa nombre-de-icono (string guardado en `categories.icon`, estilo lucide-kebab)
 * → componente de lucide-react. Cubre los iconos de las 14 categorías sistema
 * (ver trigger handle_new_user). `Tag` es el fallback para iconos desconocidos.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  home: Home,
  plug: Plug,
  'heart-pulse': HeartPulse,
  film: Film,
  'graduation-cap': GraduationCap,
  'shopping-bag': ShoppingBag,
  repeat: Repeat,
  briefcase: Briefcase,
  wallet: Wallet,
  'credit-card': CreditCard,
  'arrow-left-right': ArrowLeftRight,
}

/** Devuelve el componente lucide para el nombre de icono dado (o Tag si no existe). */
export function categoryIcon(iconName?: string | null): LucideIcon {
  if (!iconName) return Tag
  return ICON_MAP[iconName] ?? Tag
}

/** Color de categoría con fallback al coral de marca si la categoría no define color. */
export function categoryColor(color?: string | null): string {
  return color && color.trim() ? color : 'hsl(var(--primary))'
}

/**
 * Estilos inline para un avatar/chip teñido con el color de la categoría:
 * fondo translúcido + texto/icono a color pleno. Funciona sobre fondo oscuro
 * sin romper el lenguaje pastel apagado de MonAi.
 */
export function categoryTint(color?: string | null): {
  backgroundColor: string
  color: string
} {
  const c = categoryColor(color)
  // color sólido para texto/icono; fondo del mismo color al ~16% de opacidad.
  return {
    color: c,
    backgroundColor: hexToRgba(c, 0.16),
  }
}

/** Convierte #rrggbb a rgba(); si ya es hsl(var(...)) lo deja con opacidad vía color-mix-free fallback. */
function hexToRgba(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Para tokens hsl(var(--primary)) usamos color-mix con transparente.
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`
}
