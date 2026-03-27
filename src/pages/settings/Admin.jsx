import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// ── Admin / Settings screen ───────────────────────────────────────────────────
// Renders different content based on profile.role:
//   Owner:      Property info (editable), Account info, Data Entry, Team, Sign out
//   GM:         Property info (read-only), Account info (read-only), Sign out
//   Viewer:     Property info (read-only), Account info (read-only), Sign out
//   Controller: Account info, assigned properties list (read-only), Sign out

const Admin = () => {
  const { profile, activeProperty, assignedProperties, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'viewer'

  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    navigate('/login', { replace: true })
  }

  const Row = ({ label, value }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid var(--nborder)',
        fontSize: '14px',
      }}
    >
      <span style={{ color: 'var(--nt3)' }}>{label}</span>
      <span style={{ color: 'var(--nt)', fontWeight: '500' }}>{value || '—'}</span>
    </div>
  )

  const linkStyle = {
    display: 'block',
    background: 'var(--nsurf)',
    border: '1px solid var(--nborder)',
    borderRadius: 'var(--r)',
    padding: '14px 16px',
    marginBottom: '10px',
    textDecoration: 'none',
    color: 'var(--nt)',
    fontSize: '14px',
    fontWeight: '500',
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
        <div className="font-newsreader" style={{ fontSize: '18px', fontWeight: 400 }}>Settings</div>
        <div style={{ width: '40px' }} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          OWNER — full access
      ══════════════════════════════════════════════════════════════════════ */}
      {role === 'owner' && (
        <>
          {/* Property info (editable via link) */}
          <div className="section-label">Property</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"              value={activeProperty?.name} />
            <Row label="Timezone"          value={activeProperty?.timezone} />
            <Row label="Prime cost target" value={activeProperty?.prime_cost_target ? `${activeProperty.prime_cost_target}%` : '62.0%'} />
            <Row label="Your role"         value="Owner" />
          </div>

          {/* Account info */}
          <div className="section-label">Account</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"  value={[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.full_name} />
            <Row label="Email" value={profile?.email} />
          </div>

          {/* Data Entry */}
          <div className="section-label">Data Entry</div>
          <Link to="/settings/data" style={linkStyle}>
            Enter Sales &amp; Labor Data →
          </Link>

          {/* Team Management */}
          <div className="section-label">Team</div>
          <Link to="/settings/team" style={linkStyle}>
            Manage Team →
          </Link>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          GM / OPERATOR — read-only property + account, no team/data links
      ══════════════════════════════════════════════════════════════════════ */}
      {role === 'gm' && (
        <>
          <div className="section-label">Property</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"     value={activeProperty?.name} />
            <Row label="Timezone" value={activeProperty?.timezone} />
            <Row label="Your role" value="General Manager" />
          </div>

          <div className="section-label">Account</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"  value={profile?.full_name} />
            <Row label="Email" value={profile?.email} />
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          VIEWER — read-only property + account, sign out only
      ══════════════════════════════════════════════════════════════════════ */}
      {role === 'viewer' && (
        <>
          <div className="section-label">Property</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"     value={activeProperty?.name} />
            <Row label="Timezone" value={activeProperty?.timezone} />
            <Row label="Your role" value="Viewer" />
          </div>

          <div className="section-label">Account</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"  value={profile?.full_name} />
            <Row label="Email" value={profile?.email} />
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CONTROLLER — account info + assigned properties list
      ══════════════════════════════════════════════════════════════════════ */}
      {role === 'controller' && (
        <>
          <div className="section-label">Account</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            <Row label="Name"  value={profile?.full_name} />
            <Row label="Email" value={profile?.email} />
            <Row label="Role"  value="Controller / CFO" />
          </div>

          <div className="section-label">Assigned Properties</div>
          <div className="nura-card" style={{ marginBottom: '20px' }}>
            {assignedProperties.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--nt4)', padding: '8px 0' }}>No properties assigned yet.</div>
            ) : (
              assignedProperties.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: i < assignedProperties.length - 1 ? '1px solid var(--nborder)' : 'none',
                    fontSize: '14px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '500', color: 'var(--nt)' }}>{p.name}</div>
                    {p.city && <div style={{ fontSize: '12px', color: 'var(--nt3)', marginTop: '2px' }}>{p.city}</div>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--nt4)' }}>{p.timezone}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Sign out — all roles ── */}
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        className="btn-secondary"
        style={{ marginTop: '8px', color: 'var(--red)', borderColor: 'var(--red-bg)' }}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <div
        style={{
          textAlign: 'center',
          fontSize: '11px',
          color: 'var(--nt4)',
          marginTop: '32px',
          fontFamily: "'Newsreader', serif",
          fontStyle: 'italic',
        }}
      >
        Daily clarity beats monthly heroics.
      </div>
    </div>
  )
}

export default Admin
