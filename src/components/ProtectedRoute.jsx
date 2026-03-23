import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'
import { ROLE_ACCESS, ROLE_HOME } from '../lib/nav'

/**
 * requireProperty = true  → user must be authed AND have a property_id
 * requireProperty = false → user must be authed (onboarding pages)
 */
const ProtectedRoute = ({ requireProperty = true }) => {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  // Not authenticated → login
  if (!session) return <Navigate to="/login" replace />

  // Authenticated but no property
  if (requireProperty && !profile?.property_id) {
    // Check for pending invite stored during the invite accept flow
    const pendingInvite = sessionStorage.getItem('pendingInviteToken')
    if (pendingInvite) {
      return <Navigate to={`/invite/${pendingInvite}`} replace />
    }
    return <Navigate to="/onboarding" replace />
  }

  // Authenticated WITH property — redirect away from onboarding
  if (!requireProperty && profile?.property_id) {
    return <Navigate to="/" replace />
  }

  // Role-based access restriction
  if (requireProperty && profile?.property_id) {
    const role = profile.role || 'viewer'
    const allowed = ROLE_ACCESS[location.pathname]
    if (allowed && !allowed.includes(role)) {
      return <Navigate to={ROLE_HOME[role] || '/'} replace />
    }
  }

  return <Outlet />
}

export default ProtectedRoute
