import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── InviteModal ───────────────────────────────────────────────────────────────
// Bottom sheet on mobile, centered on desktop.
// Inserts into invites table, shows link on success.

const ALL_ROLE_OPTIONS = [
  { value: 'controller', label: 'Controller / CFO',  desc: 'Portfolio view, budget authority, month-end export' },
  { value: 'gm',         label: 'General Manager',   desc: 'Enter sales/labor, approve invoices, view all reports' },
  { value: 'viewer',     label: 'Viewer',             desc: 'Read-only access to reports and dashboards' },
]

const InviteModal = ({ onClose }) => {
  const { profile, activePropertyId, activeProperty } = useAuth()
  const senderRole = profile?.role

  // Owner can invite all roles; Controller can invite GM and Viewer only
  const roleOptions = senderRole === 'owner'
    ? ALL_ROLE_OPTIONS
    : ALL_ROLE_OPTIONS.filter((opt) => opt.value !== 'controller')

  const [email,     setEmail]     = useState('')
  const [role,      setRole]      = useState('gm')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [inviteLink, setInviteLink] = useState(null)
  const [copied,    setCopied]    = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Check if a profile with this email already exists for this property
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('property_id', activePropertyId)
      .maybeSingle()

    if (existing) {
      setError('This person already has access to this property.')
      setSaving(false)
      return
    }

    // Check for already-pending invite with the same email
    const { data: pendingInvite } = await supabase
      .from('invites')
      .select('id, token')
      .eq('property_id', activePropertyId)
      .eq('email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .maybeSingle()

    let token
    if (pendingInvite) {
      // Reuse existing pending invite
      token = pendingInvite.token
    } else {
      // Create new invite
      const { data: invite, error: insertErr } = await supabase
        .from('invites')
        .insert({
          property_id: activePropertyId,
          invited_by:  profile.id,
          email:       email.toLowerCase().trim(),
          role,
        })
        .select('token')
        .single()

      if (insertErr) {
        setError(insertErr.message)
        setSaving(false)
        return
      }
      token = invite.token
    }

    // Send invite email via Edge Function (fire-and-forget — link still shown on failure)
    supabase.functions.invoke('send-invite-email', {
      body: {
        email: email.toLowerCase().trim(),
        propertyName: activeProperty?.name || 'your property',
        role,
        token,
        senderName: profile?.first_name
          ? `${profile.first_name} ${profile.last_name || ''}`.trim()
          : profile?.full_name || null,
      },
    }).catch(() => {}) // silent — fallback is the manual link

    setInviteLink(`${window.location.origin}/invite/${token}`)
    setSaving(false)
  }

  const handleCopy = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const selectedRole = ALL_ROLE_OPTIONS.find((r) => r.value === role)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        zIndex: 200, display: 'flex', alignItems: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--nsurf)',
          borderRadius: '20px 20px 0 0',
          padding: '24px 20px 36px',
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
        }}
      >
        {/* Handle + header */}
        <div style={{ width: '36px', height: '4px', background: 'var(--nborder)', borderRadius: '2px', margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div className="font-newsreader" style={{ fontSize: '20px', fontWeight: 400 }}>Invite Member</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt3)', fontSize: '18px', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {!inviteLink ? (
          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                className="nura-input"
                placeholder="team@property.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Role */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '8px' }}>
                Role
              </label>
              {roleOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '11px 13px', borderRadius: 'var(--r-sm)', marginBottom: '6px',
                    border: `1px solid ${role === opt.value ? 'var(--nt)' : 'var(--nborder)'}`,
                    background: role === opt.value ? 'var(--nsurf-alt)' : 'var(--nsurf)',
                    cursor: 'pointer', transition: 'border-color 0.1s',
                  }}
                >
                  <div
                    style={{
                      width: '16px', height: '16px', borderRadius: '50%', marginTop: '1px', flexShrink: 0,
                      border: `2px solid ${role === opt.value ? 'var(--nt)' : 'var(--nborder)'}`,
                      background: role === opt.value ? 'var(--nt)' : 'transparent',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--nt)' }}>{opt.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt3)', marginTop: '2px', lineHeight: '1.4' }}>{opt.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>
            )}

            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Sending…' : 'Send Invite'}
            </button>
          </form>
        ) : (
          /* Success state */
          <div>
            <div className="note-green" style={{ marginBottom: '16px' }}>
              Invite created for <strong>{email}</strong> as {selectedRole?.label}.
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '6px' }}>
                Invite Link
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  readOnly
                  value={inviteLink}
                  className="nura-input"
                  style={{ fontSize: '12px', color: 'var(--nt3)' }}
                  onClick={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  style={{
                    flexShrink: 0, padding: '0 16px',
                    background: copied ? 'var(--green)' : 'var(--nsurf-alt)',
                    border: '1px solid var(--nborder)', borderRadius: 'var(--r-sm)',
                    color: copied ? 'white' : 'var(--nt)', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--nt4)', marginBottom: '16px' }}>
              Link expires in 7 days. Share this directly — no email is sent automatically.
            </div>

            <button
              onClick={() => { setInviteLink(null); setEmail(''); setRole('gm') }}
              className="btn-secondary"
              style={{ marginBottom: '8px' }}
            >
              Invite another person
            </button>
            <button onClick={onClose} className="btn-primary">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default InviteModal
