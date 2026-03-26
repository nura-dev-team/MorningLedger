import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--nt4)',
  marginBottom: '8px',
}

const Login = () => {
  const { session } = useAuth()

  // Password sign-in state
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError]   = useState(null)

  // Magic link state
  const [mlEmail, setMlEmail]     = useState('')
  const [mlLoading, setMlLoading] = useState(false)
  const [mlError, setMlError]     = useState(null)
  const [mlSent, setMlSent]       = useState(false)

  // Forgot password state
  const [forgotSent, setForgotSent]       = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotError, setForgotError]     = useState(null)

  if (session) return <Navigate to="/" replace />

  // ── Password sign in ──────────────────────────────────────────────────────
  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setPwLoading(true)
    setPwError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    setPwLoading(false)
    if (error) setPwError(error.message)
  }

  // ── Magic link ────────────────────────────────────────────────────────────
  const handleMagicLink = async (e) => {
    e.preventDefault()
    if (!mlEmail.trim()) return
    setMlLoading(true)
    setMlError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: mlEmail.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    })

    setMlLoading(false)
    if (error) {
      setMlError(error.message)
    } else {
      setMlSent(true)
    }
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    const target = email.trim().toLowerCase()
    if (!target) { setPwError('Enter your email above first.'); return }
    setForgotLoading(true)
    setForgotError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/login`,
    })

    setForgotLoading(false)
    if (error) {
      setForgotError(error.message)
    } else {
      setForgotSent(true)
    }
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--nbg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              fontFamily: "'Newsreader', serif",
              fontSize: '28px',
              letterSpacing: '6px',
              textTransform: 'uppercase',
              color: 'var(--nt)',
              marginBottom: '8px',
            }}
          >
            NURA
          </div>
          <div style={{ fontSize: '13px', color: 'var(--nt3)', fontWeight: '300' }}>
            Real-time financial clarity for hospitality
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            OPTION 1 — Email + Password
        ════════════════════════════════════════════════════════════ */}
        <form onSubmit={handlePasswordLogin}>
          <div
            style={{
              background: 'var(--nsurf)',
              border: '1px solid var(--nborder)',
              borderRadius: 'var(--r)',
              padding: '24px',
              marginBottom: '12px',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Email</label>
              <input
                type="email"
                className="nura-input"
                placeholder="you@yourrestaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label style={lbl}>Password</label>
              <input
                type="password"
                className="nura-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Forgot password */}
            {forgotSent ? (
              <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '8px' }}>
                Password reset link sent to {email}. Check your inbox.
              </div>
            ) : (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: '8px',
                  fontSize: '12px',
                  color: 'var(--nt3)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                {forgotLoading ? 'Sending…' : 'Forgot password?'}
              </button>
            )}
            {forgotError && (
              <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '4px' }}>{forgotError}</div>
            )}
          </div>

          {pwError && (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--red)',
                marginBottom: '12px',
                padding: '10px 14px',
                background: 'var(--red-bg)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              {pwError}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={pwLoading || !email.trim() || !password}
          >
            {pwLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--nborder)' }} />
          <span style={{ fontSize: '12px', color: 'var(--nt4)', textTransform: 'uppercase', letterSpacing: '1px' }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--nborder)' }} />
        </div>

        {/* ════════════════════════════════════════════════════════════
            OPTION 2 — Magic Link
        ════════════════════════════════════════════════════════════ */}
        {mlSent ? (
          <div
            style={{
              background: 'var(--nsurf)',
              border: '1px solid var(--nborder)',
              borderRadius: 'var(--r)',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✉️</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--nt)', marginBottom: '8px' }}>
              Check your email
            </div>
            <div style={{ fontSize: '13px', color: 'var(--nt3)', lineHeight: '1.6', marginBottom: '20px' }}>
              We sent a sign-in link to{' '}
              <span style={{ color: 'var(--nt)', fontWeight: '500' }}>{mlEmail}</span>.
              Tap it to access NURA — no password needed.
            </div>
            <button
              onClick={() => { setMlSent(false); setMlEmail('') }}
              className="btn-secondary"
              style={{ marginTop: '0' }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleMagicLink}>
            <div
              style={{
                background: 'var(--nsurf)',
                border: '1px solid var(--nborder)',
                borderRadius: 'var(--r)',
                padding: '24px',
                marginBottom: '12px',
              }}
            >
              <label style={lbl}>Sign in with magic link</label>
              <input
                type="email"
                className="nura-input"
                placeholder="you@yourrestaurant.com"
                value={mlEmail}
                onChange={(e) => setMlEmail(e.target.value)}
                required
              />
            </div>

            {mlError && (
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--red)',
                  marginBottom: '12px',
                  padding: '10px 14px',
                  background: 'var(--red-bg)',
                  borderRadius: 'var(--r-sm)',
                }}
              >
                {mlError}
              </div>
            )}

            <button
              type="submit"
              className="btn-secondary"
              disabled={mlLoading || !mlEmail.trim()}
            >
              {mlLoading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}

        {/* Sign up link */}
        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--nt4)' }}>
          Don't have an account?{' '}
          <Link to="/signup/owner" style={{ color: 'var(--nt)', fontWeight: '500', textDecoration: 'underline' }}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
