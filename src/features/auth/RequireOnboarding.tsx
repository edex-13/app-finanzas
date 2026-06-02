import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { paths } from '@/routes/paths'

export function RequireOnboarding() {
  const { data: profile, isLoading } = useProfile()
  const location = useLocation()
  if (isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    )
  }
  if (profile && !profile.onboarding_completed) {
    if (location.pathname.startsWith(paths.onboarding)) return <Outlet />
    return <Navigate to={paths.onboarding} replace />
  }
  return <Outlet />
}
