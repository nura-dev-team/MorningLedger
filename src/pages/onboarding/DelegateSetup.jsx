import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--text-4)',
  marginBottom: '8px',
}

const DelegateSetup = () => {
  const { profile, activeProperty } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]     = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError]     = useState(null)

  const handleSendInvite = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setError(null)

    // Check for existing pending invite
    const { data: existing } = await supabase
      .from('invites')
      .select('id, token')
      .eq('property_id', profile.property_id)
      .eq('email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .maybeSingle()

    const senderName = profile?.first_name
      ? `${profile.first_name} ${profile.last_name || ''}`.trim()
      : profile?.full_name || null
    const propName = activeProperty?.name || profile?.properties?.name || 'your property'

    if (existing) {
      // Resend the email for the existing invite
      supabase.functions.invoke('send-invite-email', {
        body: {
          email: email.toLowerCase().trim(),
          propertyName: propName,
          role: 'controller',
          token: existing.token,
          senderName,
          setupInvite: true,
        },
      }).catch(() => {})

      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', profile.id)
      setSending(false)
      navigate('/?setup=pending')
      return
    }

    const { data: invite, error: insertErr } = await supabase
      .from('invites')
      .insert({
        property_id:  profile.property_id,
        invited_by:   profile.id,
        email:        email.toLowerCase().trim(),
        role:         'controller',
        setup_invite: true,
      })
      .select('token')
      .single()

    setSending(false)

    if (insertErr) {
      setError(insertErr.message)
      return
    }

    // Send setup invite email (fire-and-forget)
    supabase.functions.invoke('send-invite-email', {
      body: {
        email: email.toLowerCase().trim(),
        propertyName: propName,
        role: 'controller',
        token: invite.token,
        senderName,
        setupInvite: true,
      },
    }).catch(() => {})

    // Mark onboarding complete (delegation path) and go to dashboard
    await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', profile.id)
    navigate('/?setup=pending')
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            className="font-newsreader"
            style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '8px' }}
          >
            NURA
          </div>
        </div>

        {/* Progress — step 2 context */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-4)' }}>
              Step 2 of 7
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>Delegate Setup</div>
          </div>
          <div style={{ background: 'var(--surface-alt)', height: '3px', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(2 / 7) * 100}%`, background: 'var(--amber)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
          </div>
        </div>

        <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>
          Invite your Controller to finish setup
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '24px', lineHeight: '1.6' }}>
          They will receive a task queue to configure your budgets and GL structure. You will be notified when they are done.
        </div>

        <form onSubmit={handleSendInvite}>
          <div className="nura-card" style={{ marginBottom: '14px' }}>
            <div>
              <label htmlFor="delegate-email" style={lbl}>Controller's email</label>
              <input
                id="delegate-email"
                type="text"
                inputMode="email"
                autoComplete="email"
                className="nura-input"
                placeholder="controller@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div style={{ marginTop: '12px', padding: '10px 13px', background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="bdg bdg-blue">Controller / CFO</span>
                <span style={{ fontSize: '12px', color: 'var(--text-4)' }}>Role locked</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '6px', lineHeight: '1.5' }}>
                Portfolio view, budget authority, GL setup, month-end export
              </div>
            </div>
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={sending || !email.trim()}
          >
            {sending ? 'Sending…' : 'Send Invite & Go to Dashboard'}
          </button>
        </form>

        <button
          onClick={() => navigate('/onboarding/who-sets-up')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-4)', fontSize: '13px', display: 'block',
            textAlign: 'center', width: '100%', padding: '14px 0',
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

export default DelegateSetup
