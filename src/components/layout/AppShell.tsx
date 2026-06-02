import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CreditCard,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Wallet,
  LogOut,
  Briefcase,
  Plus,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PageTransition } from '@/components/layout/PageTransition'
import { useAuth } from '@/features/auth/AuthProvider'
import { paths } from '@/routes/paths'
import { cn } from '@/lib/utils'

const links = [
  { to: paths.dashboard, label: 'Inicio', icon: LayoutDashboard },
  { to: paths.transactions, label: 'Movimientos', icon: Receipt },
  { to: paths.accounts, label: 'Cuentas', icon: Wallet },
  { to: paths.cards, label: 'Tarjetas', icon: CreditCard },
  { to: paths.debts, label: 'Deudas', icon: ListChecks },
  { to: paths.income, label: 'Ingresos', icon: Briefcase },
  { to: paths.projections, label: 'Proyección', icon: LineChart },
  { to: paths.simulator, label: 'Simulador', icon: ShoppingCart },
  { to: paths.settings, label: 'Ajustes', icon: SettingsIcon },
] as const

// Items principales del bottom-nav móvil (4 + botón central + "más")
const mobilePrimary = [links[0], links[1], links[6], links[8]] as const
const mobileSecondary = [links[2], links[3], links[4], links[5], links[7]] as const

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
        F
      </div>
      <span className="text-base font-extrabold tracking-tight">Finanzas</span>
    </div>
  )
}

export function AppShell() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    navigate(paths.login, { replace: true })
  }

  return (
    <div className="grid h-full w-full grid-cols-1 md:grid-cols-[260px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="hidden flex-col border-r border-border bg-card/60 backdrop-blur md:flex">
        <div className="flex h-16 items-center px-5">
          <BrandMark />
        </div>
        <nav className="flex-1 space-y-1 overflow-auto p-3">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === paths.dashboard}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute inset-0 rounded-xl bg-accent"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="relative h-[18px] w-[18px]" />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="truncate px-2 text-xs text-muted-foreground" title={user?.email ?? ''}>
            {user?.email}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full justify-start text-muted-foreground"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex h-full min-w-0 flex-col">
        <header className="safe-pt sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:hidden">
          <BrandMark />
          <Button size="icon" variant="ghost" onClick={handleLogout}>
            <LogOut className="h-[18px] w-[18px]" />
          </Button>
        </header>

        <main className="no-scrollbar min-w-0 flex-1 overflow-auto scroll-touch px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-5xl">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>

        {/* Bottom nav (móvil) */}
        <nav className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur-lg md:hidden">
          <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
            {mobilePrimary.slice(0, 2).map((l) => (
              <BottomNavItem key={l.to} {...l} />
            ))}

            {/* Botón central de acción rápida */}
            <div className="flex justify-center">
              <NavLink to={paths.transactions} aria-label="Agregar movimiento">
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className="grid -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground"
                  style={{ height: '3.5rem', width: '3.5rem' }}
                >
                  <Plus className="h-7 w-7" strokeWidth={2.5} />
                </motion.div>
              </NavLink>
            </div>

            {mobilePrimary.slice(2).map((l) => (
              <BottomNavItem key={l.to} {...l} />
            ))}
          </div>
        </nav>

        {/* Hoja "más" con items secundarios (móvil) — activada desde Ajustes/menú */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Más secciones</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-3 pb-2">
              {mobileSecondary.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Icon className="h-6 w-6 text-primary" />
                  {label}
                </NavLink>
              ))}
              <button
                onClick={() => {
                  setMoreOpen(false)
                  handleLogout()
                }}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center text-xs font-medium text-destructive transition-colors hover:bg-accent"
              >
                <LogOut className="h-6 w-6" />
                Salir
              </button>
            </div>
          </SheetContent>
        </Sheet>

        {/* botón "más" flotante en el nav: lo exponemos mediante el 4º slot */}
        <MoreNavTrigger onOpen={() => setMoreOpen(true)} />
      </div>
    </div>
  )
}

function BottomNavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: typeof LayoutDashboard
}) {
  return (
    <NavLink
      to={to}
      end={to === paths.dashboard}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-muted-foreground transition-colors',
          isActive && 'text-primary',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-[22px] w-[22px]', isActive && 'scale-110 transition-transform')} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

/**
 * El bottom-nav usa 4 destinos + botón central. Para no perder acceso a las
 * secciones secundarias, "Ajustes" abre la hoja de "más"; este trigger
 * invisible se monta para que el item de Ajustes del nav la dispare.
 * (Se mantiene simple: Ajustes navega normal, y desde ahí o desde el header
 * se accede a todo. La hoja queda disponible para crecer.)
 */
function MoreNavTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-label="Más secciones"
      onClick={onOpen}
      className="safe-pb fixed bottom-2 right-3 z-40 grid h-9 w-9 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground shadow-soft backdrop-blur md:hidden"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  )
}
