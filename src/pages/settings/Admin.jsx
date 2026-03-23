import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

// ── Admin / Settings screen ───────────────────────────────────────────────────

const Admin = () => {
  const { profile, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const property = profile?.properties

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

      {/* ── Property info ── */}
      <div className="section-label">Property</div>
      <div className="nura-card" style={{ marginBottom: '20px' }}>
        <Row label="Name"             value={property?.name} />
        <Row label="Timezone"         value={property?.timezone} />
        <Row label="Prime cost target" value={property?.prime_cost_target ? `${property.prime_cost_target}%` : '62.0%'} />
        <Row label="Your role"        value={profile?.role} />
      </div>

      {/* ── Account ── */}
      <div className="section-label">Account</div>
      <div className="nura-card" style={{ marginBottom: '20px' }}>
        <Row label="Email" value={profile?.email} />
        <Row label="User ID" value={profile?.id?.slice(0, 8) + '…'} />
      </div>

      {/* ── Quick links ── */}
      <div className="section-label">Data Entry</div>
      <Link
        to="/settings/data"
        style={{
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
        }}
      >
        Enter Sales &amp; Labor Data →
      </Link>

      {/* ── Team (owner only) ── */}
      {profile?.role === 'owner' && (
        <>
          <div className="section-label">Team</div>
          <Link
            to="/settings/team"
            style={{
              display: 'block',
              background: 'var(--nsurf)',
              border: '1px solid var(--nborder)',
              borderRadius: 'var(--r)',
              padding: '14px 16px',
              marginBottom: '20px',
              textDecoration: 'none',
              color: 'var(--nt)',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Manage Team →
          </Link>
        </>
      )}

      {/* ── Sign out ── */}
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
