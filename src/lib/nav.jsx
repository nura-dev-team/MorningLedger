// ── Shared navigation definitions ─────────────────────────────────────────────
// Used by both Sidebar (desktop) and BottomNav (mobile)

export const NAV_ITEMS = {
  home: {
    to: '/',
    label: 'Home',
    end: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 8.5L10 3l7 5.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V8.5z" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M7.5 18V12h5v6" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  'prime-cost': {
    to: '/prime-cost',
    label: 'Prime Cost',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 15l4-5 3 3 3-4 4 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  budgets: {
    to: '/budgets',
    label: 'Budgets',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3"   y="13" width="3" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8.5" y="9"  width="3" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14"  y="5"  width="3" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  approvals: {
    to: '/approvals',
    label: 'Approvals',
    badge: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 4h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  ledger: {
    to: '/ledger',
    label: 'Ledger',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M5 4h10a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 8h6M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  controller: {
    to: '/controller',
    label: 'Portfolio',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
}

// Groups per role — inner arrays are items in a group, groups are separated by dividers
// On mobile, dividers are not shown; on desktop sidebar, dividers appear between groups
export const NAV_GROUPS = {
  owner: [
    ['home', 'prime-cost', 'budgets', 'approvals', 'ledger'],
    ['controller'],
  ],
  gm: [
    ['home', 'prime-cost', 'budgets', 'approvals', 'ledger'],
  ],
  controller: [
    ['controller'],
    ['home', 'prime-cost', 'budgets', 'approvals', 'ledger'],
  ],
  viewer: [
    ['home', 'prime-cost', 'budgets', 'ledger'],
  ],
}

// Role home paths — where each role is routed by default
export const ROLE_HOME = {
  owner:      '/',
  gm:         '/',
  controller: '/controller',
  viewer:     '/',
}

// Which routes each role can access (omit means all roles can access)
export const ROLE_ACCESS = {
  '/approvals':      ['owner', 'gm', 'controller'],
  '/controller':     ['owner', 'controller'],
  '/settings/admin': ['owner', 'gm', 'controller', 'viewer'],
  '/settings/data':  ['owner', 'gm'],
  '/settings/team':  ['owner'],
}
