import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ROLE_HOME } from '../lib/nav'

// ── AcceptInvite ──────────────────────────────────────────────────────────────
// Public page at /invite/:token
// Flow:
//   1. Load and validate the invite token
//   2. If valid + not yet signed in: show form (name + email prefilled), send magic link
//   3. If valid + signed in (returned from magic link): create profile, update invite
//   4. Show optional password creation screen
//   5. Route to role-appropriate home

const ROLE_LABELS = {
  gm:         'General Manager',
  controller: 'Controller / CFO',
  viewer:     'Viewer',
}

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--text-4)',
  marginBottom: '8px',
}

const AcceptInvite = () => {
  const { token }   = useParams()
  const navigate    = useNavigate()
  const { session, refreshProfile } = useAuth()

  const [invite,     setInvite]     = useState(null)
  const [status,     setStatus]     = useState('loading') // loading | invalid | form | email_sent | completing | set_password | done
  const [name,       setName]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [error,      setError]      = useState(null)

  // Password creation state
  const [pw, setPw]               = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError]     = useState(null)

  // ── Step 1: Load invite ─────────────────────────────────────────────────────
  useEffect(() => {
    const fetchInvite = async () => {
      const { data, error: err } = await supabase
        .from('invites')
        .select('*, properties(name)')
        .eq('token', token)
        .maybeSingle()

      if (err || !data) { setStatus('invalid'); return }
      if (data.status !== 'pending') { setStatus('invalid'); return }
      if (new Date(data.expires_at) < new Date()) { setStatus('invalid'); return }

      setInvite(data)
      setStatus('form')
    }

    fetchInvite()
  }, [token])

  // ── Step 2: If user returns authenticated (magic link), complete the flow ───
  useEffect(() => {
    if (status !== 'form' && status !== 'email_sent') return
    if (!session || !invite) return

    // Only complete if the signed-in user's email matches the invite email
    if (session.user.email?.toLowerCase() !== invite.email?.toLowerCase()) return

    // User is now authenticated — complete invite acceptance
    const complete = async () => {
      setStatus('completing')

      // Update the profile with invite details
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          full_name:   name || sessionStorage.getItem('inviteName') || null,
          property_id: invite.property_id,
          role:        invite.role,
        })
        .eq('id', session.user.id)

      if (profileErr) {
        setError(profileErr.message)
        setStatus('form')
        return
      }

      // Mark invite as accepted
      await supabase
        .from('invites')
        .update({ status: 'accepted' })
        .eq('token', token)

      // Clean up sessionStorage
      sessionStorage.removeItem('pendingInviteToken')
      sessionStorage.removeItem('inviteName')

      // Refresh profile so AuthContext picks up new property_id and role
      await refreshProfile()

      // Show optional password creation screen
      setStatus('set_password')
    }

    complete()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, invite])

  // ── Step 3: Send magic link ──────────────────────────────────────────────────
  const handleAccept = async (e) => {
    e.preventDefault()
    setSending(true)
    setError(null)

    // Store invite context in sessionStorage so ProtectedRoute doesn't redirect to /onboarding
    sessionStorage.setItem('pendingInviteToken', token)
    if (name) sessionStorage.setItem('inviteName', name)

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: invite.email,
      options: {
        emailRedirectTo: `${window.location.origin}/invite/${token}`,
      },
    })

    setSending(false)
    if (otpErr) {
      setError(otpErr.message)
      return
    }

    setStatus('email_sent')
  }

  // ── Step 4: Set password ────────────────────────────────────────────────────
  const handleSetPassword = async (e) => {
    e.preventDefault()
    setPwError(null)

    if (pw.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (!/\d/.test(pw)) { setPwError('Password must include at least 1 number.'); return }
    if (!/[^a-zA-Z0-9]/.test(pw)) { setPwError('Password must include at least 1 symbol.'); return }
    if (pw !== pwConfirm) { setPwError('Passwords do not match.'); return }

    setPwLoading(true)

    const { error } = await supabase.auth.updateUser({ password: pw })

    setPwLoading(false)
    if (error) { setPwError(error.message); return }

    goHome()
  }

  const goHome = () => {
    setStatus('done')
    const home = ROLE_HOME[invite?.role] || '/'
    setTimeout(() => navigate(home, { replace: true }), 800)
  }

  // ── Centered screen wrapper (for non-form states) ─────────────────────────
  const CenteredScreen = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--bg)', padding: '24px' }}>
      {children}
    </div>
  )

  // ── Render states ────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <CenteredScreen>
        <div style={{ fontSize: '13px', color: 'var(--text-4)' }}>Checking invite…</div>
      </CenteredScreen>
    )
  }

  if (status === 'invalid') {
    return (
      <CenteredScreen>
        <div style={{ maxWidth: '360px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px', color: 'var(--red)' }}>✗</div>
          <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, marginBottom: '10px', color: 'var(--text)' }}>
            Invite not found
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.6', marginBottom: '24px' }}>
            This invite link has expired, already been used, or doesn't exist. Ask your team owner to send a new invite.
          </div>
          <button onClick={() => navigate('/login')} className="btn-secondary">
            Go to login
          </button>
        </div>
      </CenteredScreen>
    )
  }

  if (status === 'completing' || status === 'done') {
    return (
      <CenteredScreen>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-4)', marginBottom: '8px' }}>
            {status === 'done' ? '✓ All set — taking you in…' : 'Setting up your account…'}
          </div>
        </div>
      </CenteredScreen>
    )
  }

  if (status === 'email_sent') {
    return (
      <CenteredScreen>
        <div style={{ maxWidth: '360px', width: '100%' }}>
          <div className="font-newsreader" style={{ fontSize: '26px', fontWeight: 400, marginBottom: '6px', color: 'var(--text)' }}>
            Check your email
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.6', marginBottom: '24px' }}>
            We sent a sign-in link to <strong style={{ color: 'var(--amber)' }}>{invite?.email}</strong>. Click it to complete your account setup — no password needed.
          </div>
          <div className="note-amber">
            The link expires in 10 minutes. Check your spam folder if you don't see it.
          </div>
          <button onClick={() => setStatus('form')} className="btn-secondary" style={{ marginTop: '8px' }}>
            ← Back
          </button>
        </div>
      </CenteredScreen>
    )
  }

  // ── Set password screen (after invite acceptance) ───────────────────────────
  if (status === 'set_password') {
    return (
      <CenteredScreen>
        <div style={{ maxWidth: '380px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '20px', color: '#FFFFFF' }}>✓</div>
            <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, marginBottom: '6px', color: 'var(--text)' }}>
              You're in
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: '1.6' }}>
              Your account is set up. Create a password so you can sign in faster next time.
            </div>
          </div>

          <form onSubmit={handleSetPassword}>
            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Password</label>
              <input
                type="password"
                className="nura-input"
                placeholder="Min 8 chars, 1 number, 1 symbol"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Confirm password</label>
              <input
                type="password"
                className="nura-input"
                placeholder="Re-enter your password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
              />
            </div>

            {pwError && (
              <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px', padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)' }}>
                {pwError}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={pwLoading || !pw || !pwConfirm}>
              {pwLoading ? 'Setting password…' : 'Set Password'}
            </button>
          </form>

          <button
            onClick={goHome}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'block', width: '100%', textAlign: 'center',
              marginTop: '14px', fontSize: '13px', color: 'var(--text-3)',
              textDecoration: 'underline', padding: '4px',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Skip for now
          </button>
        </div>
      </CenteredScreen>
    )
  }

  // ── status === 'form' — Split-panel invite landing ────────────────────────
  const propertyName = invite?.properties?.name || 'Your property'

  return (
    <>
      <style>{`
        @media (max-width: 767px) { .auth-left-panel { display: none !important; } }
        @media (min-width: 768px) { .auth-mobile-logo { display: none !important; } }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
        {/* ── Left panel — property name as caption ── */}
        <div
          className="auth-left-panel"
          style={{
            width: '55%',
            position: 'relative',
            background: 'linear-gradient(160deg, #1B1A17 0%, #2A2925 50%, #1B1A17 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '40px',
            overflow: 'hidden',
          }}
        >
          {/* Grain overlay */}
          <div
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'repeat', backgroundSize: '256px 256px',
            }}
          />
          <div className="font-newsreader" style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)', position: 'relative', zIndex: 1 }}>
            NURA
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ width: '40px', height: '2px', background: 'var(--amber)', marginBottom: '16px' }} />
            <div className="font-newsreader" style={{ fontSize: '18px', fontStyle: 'italic', color: 'var(--text-2)', maxWidth: '320px', lineHeight: 1.5 }}>
              {propertyName}
            </div>
          </div>
        </div>

        {/* ── Right panel — invite form ── */}
        <div
          style={{
            width: window.innerWidth >= 768 ? '45%' : '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px 32px', background: 'var(--bg)',
          }}
        >
          <div style={{ maxWidth: '380px', width: '100%' }}>
            {/* Mobile-only wordmark */}
            <div className="auth-mobile-logo" style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div className="font-newsreader" style={{ fontSize: '13px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)' }}>
                NURA
              </div>
            </div>

            {/* Headline */}
            <div className="font-newsreader" style={{ fontSize: '28px', fontWeight: 400, color: 'var(--text)', marginBottom: '6px' }}>
              You've been invited.
            </div>

            {/* Property + role */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '500', color: 'var(--amber)' }}>{propertyName}</span>
                <span className="bdg bdg-blue">{ROLE_LABELS[invite?.role] || invite?.role}</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleAccept}>
              <div style={{ marginBottom: '14px' }}>
                <label style={lbl}>Your Name</label>
                <input
                  type="text"
                  className="nura-input"
                  placeholder="First and last name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={lbl}>Email</label>
                <input
                  type="text"
                  inputMode="email"
                  className="nura-input"
                  value={invite?.email || ''}
                  readOnly
                  style={{ opacity: 0.5 }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '4px' }}>
                  We'll send a magic link to this address to confirm it's you.
                </div>
              </div>

              {error && (
                <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px', padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={sending}>
                {sending ? 'Sending link…' : 'Accept Invite'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--text-4)' }}>
              Invited by {invite?.invited_by ? 'your team' : 'the property owner'} · Expires in 7 days
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default AcceptInvite
