import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingScreen from './LoadingScreen'

/**
 * requireProperty = true  → user must be authed AND have a property_id
 * requireProperty = false → user must be authed (onboarding pages)
 */
const ProtectedRoute = ({ requireProperty = true }) => {
  const { session, profile, loading } = useAuth()

  if (loading) return <LoadingScreen />

  // Not authenticated → login
  if (!session) return <Navigate to="/login" replace />

  // Authenticated but no property — redirect to onboarding (unless we're already going there)
  if (requireProperty && !profile?.property_id) {
    return <Navigate to="/onboarding" replace />
  }

  // Authenticated WITH property — redirect away from onboarding
  if (!requireProperty && profile?.property_id) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
