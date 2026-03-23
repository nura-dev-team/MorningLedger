import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ROLE_HOME, ROLE_ACCESS } from './lib/nav'

import Layout          from './components/Layout'
import ProtectedRoute  from './components/ProtectedRoute'
import LoadingScreen   from './components/LoadingScreen'

import Login        from './pages/Login'
import Onboarding   from './pages/Onboarding'
import Home         from './pages/Home'
import PrimeCost    from './pages/PrimeCost'
import Budgets      from './pages/Budgets'
import Approvals    from './pages/Approvals'
import Ledger       from './pages/Ledger'
import Controller   from './pages/Controller'
import EnterData    from './pages/settings/EnterData'
import Admin        from './pages/settings/Admin'
import Team         from './pages/settings/Team'
import AcceptInvite from './pages/AcceptInvite'

// Route controllers to /controller, everyone else to /
const RoleHome = () => {
  const { profile } = useAuth()
  const role = profile?.role
  if (role === 'controller') return <Navigate to="/controller" replace />
  return <Home />
}

// Guard a route by role — redirect to role home if not allowed
const RoleGuard = ({ path, children }) => {
  const { profile } = useAuth()
  const role    = profile?.role || 'viewer'
  const allowed = ROLE_ACCESS[path]
  if (allowed && !allowed.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || '/'} replace />
  }
  return children
}

const App = () => {
  const { loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Invite acceptance — public, no auth required */}
      <Route path="/invite/:token" element={<AcceptInvite />} />

      {/* Onboarding — requires auth, does NOT require property */}
      <Route element={<ProtectedRoute requireProperty={false} />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* Main app — requires auth + property */}
      <Route element={<ProtectedRoute requireProperty={true} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<RoleHome />} />
          <Route path="/prime-cost" element={<PrimeCost />} />
          <Route path="/budgets"    element={<Budgets />} />
          <Route path="/approvals"  element={
            <RoleGuard path="/approvals"><Approvals /></RoleGuard>
          } />
          <Route path="/ledger"     element={<Ledger />} />
          <Route path="/controller" element={
            <RoleGuard path="/controller"><Controller /></RoleGuard>
          } />
          <Route path="/settings/data"  element={
            <RoleGuard path="/settings/data"><EnterData /></RoleGuard>
          } />
          <Route path="/settings/admin" element={<Admin />} />
          <Route path="/settings/team"  element={
            <RoleGuard path="/settings/team"><Team /></RoleGuard>
          } />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
