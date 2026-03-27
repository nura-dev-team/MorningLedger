import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV_ITEMS, NAV_GROUPS } from '../lib/nav'

// ── Sidebar nav item ──────────────────────────────────────────────────────────

const SidebarItem = ({ to, label, end = false, badge = 0, children }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
  >
    <div style={{ position: 'relative', width: '20px', height: '20px', flexShrink: 0 }}>
      {children}
      {badge > 0 && (
        <div style={{
          position: 'absolute', top: '-2px', right: '-4px',
          width: '7px', height: '7px', borderRadius: '50%', background: 'var(--amber)',
        }} />
      )}
    </div>
    <span>{label}</span>
  </NavLink>
)

// ── Swap icon SVG ─────────────────────────────────────────────────────────────

const SwapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
    <path d="M4 2v10M4 2L1.5 4.5M4 2l2.5 2.5M10 12V2M10 12l2.5-2.5M10 12l-2.5-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar = ({ pendingCount = 0 }) => {
  const {
    profile,
    activeProperty,
    ownedProperties,
    assignedProperties,
  } = useAuth()
  const navigate = useNavigate()

  const role         = profile?.role || 'viewer'
  const groups       = NAV_GROUPS[role] || NAV_GROUPS.viewer
  const propName     = activeProperty?.name || 'Property'

  // Determine if the user can switch properties
  const canSwitch =
    (role === 'owner' && ownedProperties.length > 1) ||
    (role === 'controller' && assignedProperties.length > 1)

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '24px 20px 8px' }}>
        <div className="nura-logo" style={{ fontSize: '14px', letterSpacing: '3px' }}>NURA</div>
      </div>

      {/* Property switcher / name */}
      {canSwitch ? (
        <div
          onClick={() => navigate('/controller')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px 14px',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--nt3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {propName}
          </div>
          <SwapIcon />
        </div>
      ) : (
        <div style={{ padding: '4px 20px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>
            {propName}
          </div>
        </div>
      )}

      {/* Nav groups */}
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && (
              <div style={{ height: '1px', background: 'var(--nborder)', margin: '8px 0' }} />
            )}
            {group.map((key) => {
              const item = NAV_ITEMS[key]
              if (!item) return null
              return (
                <SidebarItem
                  key={key}
                  to={item.to}
                  label={item.label}
                  end={item.end}
                  badge={item.badge ? pendingCount : 0}
                >
                  {item.icon}
                </SidebarItem>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Settings at bottom — all roles */}
      <div style={{ marginTop: 'auto' }}>
        <div style={{ height: '1px', background: 'var(--nborder)', margin: '8px 0' }} />
        <SidebarItem to="/settings/admin" label="Settings">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M5.05 14.95l1.06-1.06M13.89 6.11l1.06-1.06"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
          </svg>
        </SidebarItem>
        <div style={{ height: '16px' }} />
      </div>
    </aside>
  )
}

export default Sidebar
