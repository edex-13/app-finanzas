import { useEffect, useState } from 'react'
import { Share, Smartphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Evento beforeinstallprompt (Chrome/Edge/Android); no está tipado en DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expone navigator.standalone fuera del estándar
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Invitación a instalar la PWA. En Android/desktop usa el prompt nativo
 * (beforeinstallprompt); en iOS (sin ese evento) muestra el paso manual de
 * Safari. No aparece si ya está instalada o si el usuario la descartó.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  // iOS no dispara beforeinstallprompt: el hint se decide al montar.
  const [showIOSHint, setShowIOSHint] = useState(
    () => isIOS() && !isStandalone() && !localStorage.getItem(DISMISS_KEY),
  )

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
    setShowIOSHint(false)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') localStorage.setItem(DISMISS_KEY, '1')
    setDeferred(null)
  }

  if (!deferred && !showIOSHint) return null

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md md:bottom-6">
      <div className="flex items-center gap-3 rounded-3xl bg-card px-4 py-3.5 shadow-soft ring-1 ring-border">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pastel-mint text-black/70">
          <Smartphone className="h-5 w-5" strokeWidth={2.5} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Lleva Finanzas contigo</p>
          {deferred ? (
            <p className="text-xs text-muted-foreground">
              Instálala en tu pantalla de inicio.
            </p>
          ) : (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Toca <Share className="inline h-3.5 w-3.5" /> y luego «Añadir a
              pantalla de inicio».
            </p>
          )}
        </div>

        {deferred && (
          <Button size="sm" className="h-9 shrink-0 px-4" onClick={install}>
            Instalar
          </Button>
        )}
        <button
          type="button"
          aria-label="Descartar"
          onClick={dismiss}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground active:scale-[0.9]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
