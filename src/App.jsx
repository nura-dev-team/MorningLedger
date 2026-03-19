import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

import Layout          from './components/Layout'
import ProtectedRoute  from './components/ProtectedRoute'
import LoadingScreen   from './components/LoadingScreen'

import Login      from './pages/Login'
import Onboarding from './pages/Onboarding'
import Home       from './pages/Home'
import PrimeCost  from './pages/PrimeCost'
import Budgets    from './pages/Budgets'
import Approvals  from './pages/Approvals'
import Ledger     from './pages/Ledger'
import Controller from './pages/Controller'
import EnterData  from './pages/settings/EnterData'
import Admin      from './pages/settings/Admin'

const App = () => {
  const { loading } = useAuth()

  // Block render until auth state is resolved
  if (loading) return <LoadingScreen />

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />

      {/* Onboarding — requires auth, does NOT require property */}
      <Route element={<ProtectedRoute requireProperty={false} />}>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>

      {/* Main app — requires auth + property */}
      <Route element={<ProtectedRoute requireProperty={true} />}>
        <Route element={<Layout />}>
          <Route path="/"              element={<Home />} />
          <Route path="/prime-cost"    element={<PrimeCost />} />
          <Route path="/budgets"       element={<Budgets />} />
          <Route path="/approvals"     element={<Approvals />} />
          <Route path="/ledger"        element={<Ledger />} />
          <Route path="/controller"    element={<Controller />} />
          <Route path="/settings/data" element={<EnterData />} />
          <Route path="/settings/admin"element={<Admin />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
