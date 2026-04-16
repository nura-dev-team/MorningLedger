import { useState, useEffect } from 'react'
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
import Admin         from './pages/settings/Admin'
import Team          from './pages/settings/Team'
import Notifications from './pages/settings/Notifications'
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
  color: 'var(--text-4)',
  marginBottom: '8px',
}

// ── Password validation ─────────────────────────────────────────────────────
const validatePassword = (pw) => {
  const errors = []
  if (pw.length < 8) errors.push('At least 8 characters')
  if (!/\d/.test(pw)) errors.push('At least 1 number')
  if (!/[^a-zA-Z0-9]/.test(pw)) errors.push('At least 1 symbol')
  return errors
}

// ── Rotating captions + background images for split-panel auth screens ──────
const AUTH_SLIDES = [
  {
    caption: 'Did we hit prime cost this week?',
    image:   '/auth-bg/GettyImages_FineDiningChefPlating.jpg',
  },
  {
    caption: 'Know before service. Every morning.',
    image:   '/auth-bg/food-beverage-jobs.jpg',
  },
  {
    caption: 'Built for the people who built this.',
    image:   '/auth-bg/woman-man-ipad-calculator-1024x683.jpg',
  },
]

// ── Reusable split-panel left side ──────────────────────────────────────────
export const AuthLeftPanel = () => {
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let timeout
    const interval = setInterval(() => {
      setVisible(false)
      timeout = setTimeout(() => {
        setIdx(i => (i + 1) % AUTH_SLIDES.length)
        setVisible(true)
      }, 700)
    }, 5500)
    return () => { clearInterval(interval); clearTimeout(timeout) }
  }, [])

  return (
    <div
      className="auth-left-panel"
      style={{
        width: '55%',
        position: 'relative',
        background: 'linear-gradient(160deg, #1B1A17 0%, #2A2925 50%, #1B1A17 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '40px',
        overflow: 'hidden',
      }}
    >
      {/* Rotating background images (crossfade) */}
      {AUTH_SLIDES.map((slide, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${slide.image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: (i === idx && visible) ? 1 : 0,
            transition: 'opacity 1200ms ease',
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Dark gradient overlay for text legibility */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, rgba(27,26,23,0.55) 0%, rgba(27,26,23,0.25) 50%, rgba(27,26,23,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Grain overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          opacity: 0.03,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* NURA wordmark top-left */}
      <div
        className="font-newsreader"
        style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)', position: 'relative', zIndex: 1 }}
      >
        NURA
      </div>

      {/* CENTERED caption block — fills the vertical space */}
      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
      }}>
        <div style={{ width: '40px', height: '2px', background: 'var(--amber)', marginBottom: '20px' }} />
        <div
          className="font-newsreader"
          style={{
            fontSize: '24px', fontStyle: 'italic', color: 'var(--text-1, #F5F3EE)',
            maxWidth: '420px', lineHeight: 1.5,
            opacity: visible ? 1 : 0,
            transition: 'opacity 700ms ease',
          }}
        >
          {AUTH_SLIDES[idx].caption}
        </div>
      </div>

      {/* Footer spacer (keeps wordmark pinned top, caption centered) */}
      <div style={{ height: '1px' }} />
    </div>
  )
}

// ── Inline skip-link button style (matches Onboarding's skipBtn) ─────────────
const skipBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-4)',
  fontSize: '13px',
  display: 'block',
  textAlign: 'center',
  width: '100%',
  padding: '8px 0',
  fontFamily: "'DM Sans', sans-serif",
}

// ── Owner Landing — public marketing page ───────────────────────────────────
const OwnerLanding = () => {
  const navigate = useNavigate()
  return (
    <>
      <style>{`
        @media (max-width: 767px) { .auth-left-panel { display: none !important; } }
        @media (min-width: 768px) { .auth-mobile-logo { display: none !important; } }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        <AuthLeftPanel />
        <div
          style={{
            width: window.innerWidth >= 768 ? '45%' : '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px 32px', background: 'var(--bg)',
          }}
        >
          <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
            {/* Mobile-only wordmark */}
            <div className="auth-mobile-logo" style={{ marginBottom: '24px' }}>
              <div className="font-newsreader" style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)' }}>
                NURA
              </div>
            </div>

            <div
              className="font-newsreader"
              style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '24px' }}
            >
              NURA
            </div>
            <div className="font-newsreader" style={{ fontSize: '24px', color: 'var(--text)', lineHeight: '1.4', marginBottom: '28px' }}>
              Run your restaurant on real numbers
            </div>
            <div style={{ textAlign: 'left', marginBottom: '32px' }}>
              {[
                'Prime cost every morning before service',
                'Know you are over budget before it is too late',
                'Invoices coded and categorized automatically',
              ].map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--amber)', marginTop: '6px', flexShrink: 0 }} />
                  <div style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: '1.5' }}>{point}</div>
                </div>
              ))}
            </div>
            <button
              className="btn-primary"
              onClick={() => navigate('/signup')}
              style={{ width: '100%', marginBottom: '16px' }}
            >
              Create Your Account
            </button>
            <Link to="/invite" style={{ fontSize: '13px', color: 'var(--text-3)', textDecoration: 'underline' }}>
              Invited to join a property? Enter here
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Owner Signup — email + password account creation ────────────────────────
const OwnerSignup = () => {
  const { session } = useAuth()

  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [signupComplete, setSignupComplete] = useState(false)
  const [signupEmail, setSignupEmail]       = useState('')

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

    setSignupEmail(form.email.trim().toLowerCase())
    setSignupComplete(true)
  }

  const fieldErr = (field) => fieldErrors[field] ? (
    <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>{fieldErrors[field]}</div>
  ) : null

  if (signupComplete) {
    return (
      <>
        <style>{`
          @media (max-width: 767px) { .auth-left-panel { display: none !important; } }
          @media (min-width: 768px) { .auth-mobile-logo { display: none !important; } }
        `}</style>
        <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
          <AuthLeftPanel />
          <div
            style={{
              width: window.innerWidth >= 768 ? '45%' : '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '40px 32px', background: 'var(--bg)',
            }}
          >
            <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
              <div className="auth-mobile-logo" style={{ marginBottom: '24px' }}>
                <div className="font-newsreader" style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)' }}>
                  NURA
                </div>
              </div>

              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'rgba(201, 168, 76, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: '28px',
              }}>
                ✉
              </div>

              <div className="font-newsreader" style={{ fontSize: '28px', color: 'var(--text)', marginBottom: '12px' }}>
                Check your inbox
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: '8px' }}>
                We sent a confirmation link to
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginBottom: '24px', wordBreak: 'break-all' }}>
                {signupEmail}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: '28px' }}>
                Click the link in that email to verify your account. Once verified, you'll be taken to your restaurant setup.
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-4)', lineHeight: 1.6, marginBottom: '16px' }}>
                Didn't get it? Check your spam folder, or
              </div>
              <button
                className="btn-secondary"
                onClick={async () => {
                  await supabase.auth.resend({ type: 'signup', email: signupEmail })
                }}
                style={{ width: '100%', marginBottom: '12px' }}
              >
                Resend confirmation email
              </button>
              <button
                onClick={() => { setSignupComplete(false); setSignupEmail('') }}
                style={{ ...skipBtn, width: '100%' }}
              >
                Use a different email
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        @media (max-width: 767px) { .auth-left-panel { display: none !important; } }
        @media (min-width: 768px) { .auth-mobile-logo { display: none !important; } }
      `}</style>
      <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        <AuthLeftPanel />
        <div
          style={{
            width: window.innerWidth >= 768 ? '45%' : '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px 32px', background: 'var(--bg)',
          }}
        >
          <div style={{ width: '100%', maxWidth: '380px' }}>
            {/* Mobile-only wordmark */}
            <div className="auth-mobile-logo" style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div className="font-newsreader" style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)' }}>
                NURA
              </div>
            </div>

            {/* Headline */}
            <div className="font-newsreader" style={{ fontSize: '28px', fontWeight: 400, color: 'var(--text)', marginBottom: '32px' }}>
              Create your account.
            </div>

            <form onSubmit={handleSignup}>
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
              <div style={{ marginBottom: '20px' }}>
                <label style={lbl}>Confirm password</label>
                <input type="password" className="nura-input" placeholder="Re-enter your password" value={form.confirm} onChange={update('confirm')} />
                {fieldErr('confirm')}
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

            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text-4)' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--amber)', fontWeight: '500', textDecoration: 'underline' }}>
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Home screen for all roles — controllers see the same dashboard as everyone else.
// Initial post-login routing for controllers is handled by AcceptInvite / ROLE_HOME.
const RoleHome = () => {
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
          <Route path="/settings/notifications" element={<Notifications />} />
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
