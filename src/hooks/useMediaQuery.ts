import { useEffect, useState } from 'react'

/** Devuelve true cuando la media query coincide. SSR-safe. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** true en viewport de escritorio (>= 768px, breakpoint md de Tailwind). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)')
}
