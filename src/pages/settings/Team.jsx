import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import InviteModal from '../../components/InviteModal'

// ── Team settings ─────────────────────────────────────────────────────────────
// Only accessible to Owner role (enforced by RoleGuard in App.jsx).
// Lists current team members and pending invites for the property.

const ROLE_LABELS = {
  owner:      'Owner',
  gm:         'General Manager',
  controller: 'Controller',
  viewer:     'Viewer',
}

const ROLE_BADGE_CLASS = {
  owner:      'bdg bdg-amber',
  gm:         'bdg bdg-green',
  controller: 'bdg bdg-blue',
  viewer:     'bdg bdg-neutral',
}

const Team = () => {
  const { profile, activePropertyId } = useAuth()
  const navigate    = useNavigate()
  const propertyId  = activePropertyId

  const [members,      setMembers]      = useState([])
  const [invites,      setInvites]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showInvite,   setShowInvite]   = useState(false)
  const [resendingId,  setResendingId]  = useState(null)

  const fetchData = async () => {
    if (!propertyId) return
    setLoading(true)

    const [membersRes, invitesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .eq('property_id', propertyId)
        .order('created_at'),

      supabase
        .from('invites')
        .select('id, email, role, status, created_at, expires_at')
        .eq('property_id', propertyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])

    setMembers(membersRes.data || [])
    setInvites(invitesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [propertyId])

  const handleResend = async (inviteId) => {
    setResendingId(inviteId)
    // Extend expiry by 7 days from now
    await supabase
      .from('invites')
      .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', inviteId)
    setResendingId(null)
    // Note: resend doesn't automatically re-send the email — the link URL is unchanged.
    // Owners should copy and re-share the link from the Invite modal.
    fetchData()
  }

  const daysUntilExpiry = (expiresAt) => {
    const diff = new Date(expiresAt) - new Date()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt3)', fontSize: '14px', padding: 0 }}
        >
          ← Back
        </button>
        <div className="font-newsreader" style={{ fontSize: '18px', fontWeight: 400 }}>Team</div>
        {(profile?.role === 'owner' || profile?.role === 'controller') ? (
          <button
            onClick={() => setShowInvite(true)}
            style={{
              background: 'var(--nt)', color: 'white', border: 'none',
              borderRadius: 'var(--r-sm)', padding: '6px 12px',
              fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
              fontWeight: '600', cursor: 'pointer',
            }}
          >
            + Invite
          </button>
        ) : (
          <div style={{ width: '40px' }} />
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => { setShowInvite(false); fetchData() }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--nt4)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : (
        <>
          {/* ── Current members ── */}
          <div className="section-label">Team Members</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            {members.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--nt3)', textAlign: 'center', padding: '12px 0' }}>
                No members found.
              </div>
            ) : members.map((m, i) => (
              <div
                key={m.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < members.length - 1 ? '1px solid var(--nborder)' : 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>
                    {m.full_name || m.email || 'Unknown'}
                  </div>
                  {m.full_name && (
                    <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>{m.email}</div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--nt4)', marginTop: '2px' }}>
                    Joined {fmtDate(m.created_at)}
                  </div>
                </div>
                <span className={ROLE_BADGE_CLASS[m.role] || 'bdg bdg-neutral'}>
                  {ROLE_LABELS[m.role] || m.role}
                </span>
              </div>
            ))}
          </div>

          {/* ── Pending invites ── */}
          {invites.length > 0 && (
            <>
              <div className="section-label">Pending Invites</div>
              <div className="nura-card">
                {invites.map((inv, i) => (
                  <div
                    key={inv.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: i < invites.length - 1 ? '1px solid var(--nborder)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{inv.email}</div>
                      <div style={{ fontSize: '11px', color: 'var(--nt4)', marginTop: '2px' }}>
                        Sent {fmtDate(inv.created_at)} · Expires in {daysUntilExpiry(inv.expires_at)}d
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={ROLE_BADGE_CLASS[inv.role] || 'bdg bdg-neutral'}>
                        {ROLE_LABELS[inv.role] || inv.role}
                      </span>
                      <button
                        onClick={() => handleResend(inv.id)}
                        disabled={resendingId === inv.id}
                        style={{
                          background: 'none', border: '1px solid var(--nborder)',
                          borderRadius: 'var(--r-sm)', padding: '4px 10px',
                          fontSize: '12px', color: 'var(--nt3)', cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {resendingId === inv.id ? '…' : 'Resend'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Team
