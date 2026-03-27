import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ROLE_HOME, ROLE_ACCESS } from './lib/nav'
import { supabase } from './lib/supabase'

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
import AcceptInvite    from './pages/AcceptInvite'
import DelegationFork  from './pages/onboarding/DelegationFork'
import DelegateSetup   from './pages/onboarding/DelegateSetup'

// ── Shared label style ──────────────────────────────────────────────────────
const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--nt4)',
  marginBottom: '6px',
}

// ── Password validation ─────────────────────────────────────────────────────
const validatePassword = (pw) => {
  const errors = []
  if (pw.length < 8) errors.push('At least 8 characters')
  if (!/\d/.test(pw)) errors.push('At least 1 number')
  if (!/[^a-zA-Z0-9]/.test(pw)) errors.push('At least 1 symbol')
  return errors
}

// ── Owner Landing — public marketing page ───────────────────────────────────
const OwnerLanding = () => {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--nbg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <div
          className="font-newsreader"
          style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--nt)', marginBottom: '24px' }}
        >
          NURA
        </div>
        <div className="font-newsreader" style={{ fontSize: '24px', color: 'var(--nt)', lineHeight: '1.4', marginBottom: '28px' }}>
          Run your restaurant on real numbers
        </div>
        <div style={{ textAlign: 'left', marginBottom: '32px' }}>
          {[
            'Prime cost every morning before service',
            'Know you are over budget before it is too late',
            'Invoices coded and categorized automatically',
          ].map((point, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--gold, #C5A572)', marginTop: '6px', flexShrink: 0 }} />
              <div style={{ fontSize: '14px', color: 'var(--nt2)', lineHeight: '1.5' }}>{point}</div>
            </div>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={() => navigate('/signup')}
          style={{ background: 'var(--gold, #C5A572)', width: '100%', marginBottom: '16px' }}
        >
          Create Your Account
        </button>
        <Link to="/invite" style={{ fontSize: '13px', color: 'var(--nt3)', textDecoration: 'underline' }}>
          Invited to join a property? Enter here
        </Link>
      </div>
    </div>
  )
}

// ── Owner Signup — email + password account creation ────────────────────────
const OwnerSignup = () => {
  const { session } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  // Already logged in — go to onboarding
  if (session) return <Navigate to="/onboarding" replace />

  const update = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setFieldErrors(fe => ({ ...fe, [field]: null }))
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError(null)

    // Client-side validation
    const fe = {}
    if (!form.first_name.trim()) fe.first_name = 'Required'
    if (!form.last_name.trim()) fe.last_name = 'Required'
    if (!form.email.trim()) fe.email = 'Required'

    const pwErrors = validatePassword(form.password)
    if (pwErrors.length > 0) fe.password = pwErrors.join(', ')
    if (form.password !== form.confirm) fe.confirm = 'Passwords do not match'

    if (Object.keys(fe).length > 0) { setFieldErrors(fe); return }

    setLoading(true)

    const { error: signUpErr } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
        },
      },
    })

    setLoading(false)

    if (signUpErr) {
      setError(signUpErr.message)
      return
    }

    navigate('/onboarding', { replace: true })
  }

  const fieldErr = (field) => fieldErrors[field] ? (
    <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{fieldErrors[field]}</div>
  ) : null

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--nbg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            className="font-newsreader"
            style={{ fontSize: '28px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--nt)', marginBottom: '8px' }}
          >
            NURA
          </div>
          <div style={{ fontSize: '13px', color: 'var(--nt3)', fontWeight: '300' }}>
            Create your owner account
          </div>
        </div>

        <form onSubmit={handleSignup}>
          <div
            style={{
              background: 'var(--nsurf)',
              border: '1px solid var(--nborder)',
              borderRadius: 'var(--r)',
              padding: '24px',
              marginBottom: '12px',
            }}
          >
            {/* Name row */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>First name</label>
                <input type="text" className="nura-input" placeholder="First" value={form.first_name} onChange={update('first_name')} autoFocus />
                {fieldErr('first_name')}
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Last name</label>
                <input type="text" className="nura-input" placeholder="Last" value={form.last_name} onChange={update('last_name')} />
                {fieldErr('last_name')}
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Work email</label>
              <input type="text" inputMode="email" autoComplete="email" className="nura-input" placeholder="you@yourrestaurant.com" value={form.email} onChange={update('email')} />
              {fieldErr('email')}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Password</label>
              <input type="password" className="nura-input" placeholder="Min 8 chars, 1 number, 1 symbol" value={form.password} onChange={update('password')} />
              {fieldErr('password')}
            </div>

            {/* Confirm */}
            <div>
              <label style={lbl}>Confirm password</label>
              <input type="password" className="nura-input" placeholder="Re-enter your password" value={form.confirm} onChange={update('confirm')} />
              {fieldErr('confirm')}
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px', padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)' }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating account…' : 'Create Your Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'var(--nt4)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--nt)', fontWeight: '500', textDecoration: 'underline' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

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
      <Route path="/signup" element={<OwnerSignup />} />
      <Route path="/signup/owner" element={<OwnerLanding />} />

      {/* Invite acceptance — public, no auth required */}
      <Route path="/invite/:token" element={<AcceptInvite />} />

      {/* Onboarding — requires auth, does NOT require property */}
      <Route element={<ProtectedRoute requireProperty={false} />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/onboarding/who-sets-up" element={<DelegationFork />} />
        <Route path="/onboarding/delegate" element={<DelegateSetup />} />
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
