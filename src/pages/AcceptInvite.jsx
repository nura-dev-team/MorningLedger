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
  color: 'var(--nt4)',
  marginBottom: '6px',
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

  // ── Render states ────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)' }}>
        <div style={{ fontSize: '13px', color: 'var(--nt4)' }}>Checking invite…</div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)', padding: '24px' }}>
        <div style={{ maxWidth: '360px', width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>✗</div>
          <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, marginBottom: '10px' }}>
            Invite not found
          </div>
          <div style={{ fontSize: '14px', color: 'var(--nt3)', lineHeight: '1.6', marginBottom: '24px' }}>
            This invite link has expired, already been used, or doesn't exist. Ask your team owner to send a new invite.
          </div>
          <button
            onClick={() => navigate('/login')}
            className="btn-secondary"
          >
            Go to login
          </button>
        </div>
      </div>
    )
  }

  if (status === 'completing' || status === 'done') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--nt4)', marginBottom: '8px' }}>
            {status === 'done' ? '✓ All set — taking you in…' : 'Setting up your account…'}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'email_sent') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)', padding: '24px' }}>
        <div style={{ maxWidth: '360px', width: '100%' }}>
          <div className="font-newsreader" style={{ fontSize: '26px', fontWeight: 400, marginBottom: '6px' }}>
            Check your email
          </div>
          <div style={{ fontSize: '14px', color: 'var(--nt3)', lineHeight: '1.6', marginBottom: '24px' }}>
            We sent a sign-in link to <strong style={{ color: 'var(--nt)' }}>{invite?.email}</strong>. Click it to complete your account setup — no password needed.
          </div>
          <div className="note-amber">
            The link expires in 10 minutes. Check your spam folder if you don't see it.
          </div>
          <button
            onClick={() => setStatus('form')}
            className="btn-secondary"
            style={{ marginTop: '8px' }}
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // ── Set password screen (after invite acceptance) ───────────────────────────
  if (status === 'set_password') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)', padding: '24px' }}>
        <div style={{ maxWidth: '380px', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✓</div>
            <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, marginBottom: '6px' }}>
              You're in
            </div>
            <div style={{ fontSize: '14px', color: 'var(--nt3)', lineHeight: '1.6' }}>
              Your account is set up. Create a password so you can sign in faster next time.
            </div>
          </div>

          <form onSubmit={handleSetPassword}>
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
              <div>
                <label style={lbl}>Confirm password</label>
                <input
                  type="password"
                  className="nura-input"
                  placeholder="Re-enter your password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                />
              </div>
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
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'block',
              width: '100%',
              textAlign: 'center',
              marginTop: '14px',
              fontSize: '13px',
              color: 'var(--nt3)',
              textDecoration: 'underline',
              padding: '4px',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    )
  }

  // status === 'form'
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', background: 'var(--nbg)', padding: '24px' }}>
      <div style={{ maxWidth: '380px', width: '100%' }}>
        {/* Property + role */}
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div className="nura-logo" style={{ fontSize: '13px', letterSpacing: '3px', marginBottom: '20px' }}>NURA</div>
          <div className="font-newsreader" style={{ fontSize: '28px', fontWeight: 400, marginBottom: '8px' }}>
            {invite?.properties?.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <span className="bdg bdg-blue">{ROLE_LABELS[invite?.role] || invite?.role}</span>
            <span style={{ fontSize: '13px', color: 'var(--nt3)' }}>— you've been invited</span>
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
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={lbl}>Email</label>
            <input
              type="email"
              className="nura-input"
              value={invite?.email || ''}
              readOnly
              style={{ opacity: 0.7 }}
            />
            <div style={{ fontSize: '11px', color: 'var(--nt4)', marginTop: '4px' }}>
              We'll send a magic link to this address to confirm it's you.
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>
          )}

          <button type="submit" className="btn-primary" disabled={sending}>
            {sending ? 'Sending link…' : 'Accept Invite'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--nt4)' }}>
          We use magic links to verify your email — no password needed.
        </div>
      </div>
    </div>
  )
}

export default AcceptInvite
