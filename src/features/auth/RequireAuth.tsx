import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { paths } from '@/routes/paths'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid h-full place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to={paths.login} replace state={{ from: location }} />
  }
  return <Outlet />
}
