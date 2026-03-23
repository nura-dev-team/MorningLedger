import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { NAV_ITEMS, NAV_GROUPS } from '../lib/nav'

const NavItem = ({ to, label, end = false, badge = 0, children }) => {
  const location = useLocation()
  const isActive = end ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <NavLink to={to} end={end} className={`nav-item${isActive ? ' active' : ''}`}>
      <div style={{ position: 'relative' }}>
        {children}
        {badge > 0 && (
          <div style={{
            position: 'absolute', top: '-2px', right: '-4px',
            width: '7px', height: '7px', borderRadius: '50%', background: 'var(--amber)',
          }} />
        )}
      </div>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

const BottomNav = ({ pendingCount = 0 }) => {
  const { profile } = useAuth()
  const role   = profile?.role || 'viewer'
  const groups = NAV_GROUPS[role] || NAV_GROUPS.viewer
  // Flatten groups into a single ordered list for mobile (no dividers)
  const items  = groups.flat()

  return (
    <nav className="bottom-nav">
      {items.map((key) => {
        const item = NAV_ITEMS[key]
        if (!item) return null
        return (
          <NavItem
            key={key}
            to={item.to}
            label={item.label}
            end={item.end}
            badge={item.badge ? pendingCount : 0}
          >
            {item.icon}
          </NavItem>
        )
      })}
    </nav>
  )
}

export default BottomNav
