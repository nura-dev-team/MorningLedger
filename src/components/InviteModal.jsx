import { useState, useEffect } from 'react'
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

  const isDesktop = window.innerWidth >= 768

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-heavy)',
        zIndex: 999, display: 'flex',
        alignItems: isDesktop ? 'center' : 'flex-end',
        justifyContent: isDesktop ? 'center' : 'stretch',
        animation: 'fade-in 0.15s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: isDesktop ? 'var(--r-lg)' : '20px 20px 0 0',
          padding: '24px 24px 32px',
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
          animation: isDesktop ? 'modal-enter 0.2s ease-out' : 'modal-enter-mobile 0.25s ease-out',
        }}
      >
        {/* Handle + header */}
        <div style={{ width: '36px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div className="font-newsreader" style={{ fontSize: '20px', fontWeight: 400 }}>Invite Member</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '18px', padding: '8px', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>

        {!inviteLink ? (
          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '6px' }}>
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
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                Role
              </label>
              <div role="radiogroup" aria-label="Role">
                {roleOptions.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '12px 14px', borderRadius: 'var(--r-sm)', marginBottom: '6px',
                      border: `1px solid ${role === opt.value ? 'var(--text)' : 'var(--border)'}`,
                      background: role === opt.value ? 'var(--surface-alt)' : 'var(--surface)',
                      cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={opt.value}
                      checked={role === opt.value}
                      onChange={() => setRole(opt.value)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div
                      aria-hidden="true"
                      style={{
                        width: '16px', height: '16px', borderRadius: '50%', marginTop: '1px', flexShrink: 0,
                        border: `2px solid ${role === opt.value ? 'var(--text)' : 'var(--border)'}`,
                        background: role === opt.value ? 'var(--text)' : 'transparent',
                        transition: 'border-color 0.15s, background 0.15s',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>{opt.label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px', lineHeight: '1.4' }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
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
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '6px' }}>
                Invite Link
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  readOnly
                  value={inviteLink}
                  className="nura-input"
                  style={{ fontSize: '12px', color: 'var(--text-3)' }}
                  onClick={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  style={{
                    flexShrink: 0, padding: '0 16px',
                    background: copied ? 'var(--green)' : 'var(--surface-alt)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                    color: copied ? 'white' : 'var(--text)', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-4)', marginBottom: '16px' }}>
              Link expires in 7 days. An invite email has been sent — you can also share this link directly.
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
