import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const { session } = useAuth()
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Already logged in
  if (session) return <Navigate to="/" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
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
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
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

        {sent ? (
          /* ── Sent state ── */
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
            <div
              style={{
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--nt)',
                marginBottom: '8px',
              }}
            >
              Check your email
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--nt3)',
                lineHeight: '1.6',
                marginBottom: '20px',
              }}
            >
              We sent a sign-in link to{' '}
              <span style={{ color: 'var(--nt)', fontWeight: '500' }}>{email}</span>.
              Tap it to access NURA — no password needed.
            </div>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              className="btn-secondary"
              style={{ marginTop: '0' }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          /* ── Login form ── */
          <form onSubmit={handleSubmit}>
            <div
              style={{
                background: 'var(--nsurf)',
                border: '1px solid var(--nborder)',
                borderRadius: 'var(--r)',
                padding: '24px',
                marginBottom: '12px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.8px',
                  color: 'var(--nt4)',
                  marginBottom: '8px',
                }}
              >
                Work email
              </label>
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

            {error && (
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
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !email.trim()}
            >
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>

            <div
              style={{
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--nt4)',
                marginTop: '20px',
                lineHeight: '1.6',
              }}
            >
              No password. No app download.
              <br />
              Just a link in your inbox.
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default Login
