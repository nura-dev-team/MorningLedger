import { NavLink } from 'react-router-dom'
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

// ── Sidebar ───────────────────────────────────────────────────────────────────

const Sidebar = ({ pendingCount = 0 }) => {
  const { profile } = useAuth()
  const role         = profile?.role || 'viewer'
  const propertyName = profile?.properties?.name || 'Property'
  const groups       = NAV_GROUPS[role] || NAV_GROUPS.viewer

  return (
    <aside className="sidebar">
      {/* Logo + property name */}
      <div style={{ padding: '24px 20px 20px' }}>
        <div className="nura-logo" style={{ fontSize: '14px', letterSpacing: '3px' }}>NURA</div>
        <div style={{ fontSize: '11px', color: 'var(--nt3)', marginTop: '5px' }}>
          {propertyName}
        </div>
      </div>

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

      {/* Settings at bottom (owner only) */}
      {role === 'owner' && (
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
      )}
    </aside>
  )
}

export default Sidebar
