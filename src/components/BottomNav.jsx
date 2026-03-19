import { NavLink, useLocation } from 'react-router-dom'

const NavItem = ({ to, label, badge, children }) => {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <NavLink to={to} className={`nav-item${isActive ? ' active' : ''}`}>
      <div style={{ position: 'relative' }}>
        {children}
        {badge > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-4px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'var(--amber)',
            }}
          />
        )}
      </div>
      <span className="nav-label">{label}</span>
    </NavLink>
  )
}

const BottomNav = ({ pendingCount = 0 }) => (
  <nav className="bottom-nav">
    <NavItem to="/" label="Home">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 8.5L10 3l7 5.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V8.5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M7.5 18V12h5v6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </NavItem>

    <NavItem to="/prime-cost" label="Prime Cost">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 15l4-5 3 3 3-4 4 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </NavItem>

    <NavItem to="/budgets" label="Budgets">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3"   y="13" width="3" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.5" y="9"  width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14"  y="5"  width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </NavItem>

    <NavItem to="/approvals" label="Approvals" badge={pendingCount}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </NavItem>

    <NavItem to="/ledger" label="Ledger">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 4h10a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </NavItem>

    <NavItem to="/controller" label="Portfolio">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </NavItem>
  </nav>
)

export default BottomNav
