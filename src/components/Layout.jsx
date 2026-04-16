import { Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import BottomNav from './BottomNav'
import Sidebar   from './Sidebar'
import AddInvoiceModal from './AddInvoiceModal'

// ── Route → page metadata ────────────────────────────────────────────────────
// Desktop topbar: title + subtitle
// Mobile header: title + greeting (contextual)

const PAGE_META = {
  '/':            { title: 'Home',                 sub: 'Where do you stand today?',       mobileTitle: 'Where you stand' },
  '/prime-cost':  { title: 'Prime Cost',           sub: "What's driving health or risk?",  mobileTitle: 'Prime cost' },
  '/budgets':     { title: 'Budgets',              sub: 'What do you have left — and why?', mobileTitle: 'Budgets' },
  '/approvals':   { title: 'Acknowledge & Code',   sub: 'Context at the moment of spend',  mobileTitle: 'Acknowledge & Code' },
  '/ledger':      { title: 'Ledger',               sub: 'Is this clean and explainable?',  mobileTitle: 'Ledger' },
  '/controller':  { title: 'Controller Dashboard', sub: 'Portfolio-level visibility',      mobileTitle: 'Portfolio' },
  '/settings/admin':         { title: 'Settings',              sub: '', mobileTitle: 'Settings' },
  '/settings/data':          { title: 'Enter Data',            sub: '', mobileTitle: 'Enter Data' },
  '/settings/team':          { title: 'Team',                  sub: '', mobileTitle: 'Team' },
  '/settings/notifications': { title: 'Notification Preferences', sub: '', mobileTitle: 'Preferences' },
}

// ── Mobile greeting helper ───────────────────────────────────────────────────

function getMobileGreeting(pathname, pendingCount) {
  const now = new Date()
  const hour = now.getHours()
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
  const timeOfDay = hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening'

  switch (pathname) {
    case '/':           return `${dayName} ${timeOfDay}`
    case '/prime-cost': return "What's driving this?"
    case '/budgets':    return 'What do you have left?'
    case '/approvals':  return pendingCount > 0 ? `${pendingCount} pending review` : 'All clear'
    case '/ledger':     return 'Is this clean?'
    case '/controller': return 'Controller view'
    default:            return ''
  }
}

// ── Topbar (desktop only — hidden via CSS on mobile) ─────────────────────────

const Topbar = ({ onAddInvoice }) => {
  const location = useLocation()
  const meta = PAGE_META[location.pathname] || { title: 'NURA', sub: '' }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="topbar">
      <div>
        <h1 style={{
          fontFamily: "'Newsreader', serif",
          fontSize: '20px',
          fontWeight: 400,
          letterSpacing: '-0.3px',
          margin: 0,
        }}>
          {meta.title}
        </h1>
        {meta.sub && (
          <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '1px' }}>
            {meta.sub}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={onAddInvoice}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            minHeight: '40px',
            borderRadius: 'var(--r-sm)',
            fontSize: '12.5px',
            fontWeight: 600,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Invoice
        </button>
        <div style={{
          fontSize: '12.5px',
          color: 'var(--text-2)',
          background: 'var(--surface-alt)',
          padding: '6px 14px',
          borderRadius: '20px',
          fontWeight: 500,
        }}>
          {today}
        </div>
      </div>
    </div>
  )
}

// ── Mobile header (hidden on desktop via CSS) ────────────────────────────────

const MobileHeader = ({ pendingCount }) => {
  const location = useLocation()
  const { activeProperty } = useAuth()
  const meta = PAGE_META[location.pathname] || { mobileTitle: 'NURA' }
  const greeting = getMobileGreeting(location.pathname, pendingCount)
  const propName = activeProperty?.name || 'Property'

  return (
    <div className="mobile-header">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2px',
      }}>
        <span style={{ fontSize: '13px', color: 'var(--text-3)', fontWeight: 400 }}>
          {greeting}
        </span>
        <span style={{
          fontSize: '12px',
          color: 'var(--text-3)',
          background: 'var(--surface-alt)',
          padding: '3px 10px',
          borderRadius: '100px',
          fontWeight: 500,
        }}>
          {propName}
        </span>
      </div>
      <div style={{
        fontFamily: "'Newsreader', serif",
        fontSize: '26px',
        fontWeight: 400,
        letterSpacing: '-0.5px',
        marginTop: '2px',
      }}>
        {meta.mobileTitle}
      </div>
    </div>
  )
}

// ── Layout ───────────────────────────────────────────────────────────────────

const Layout = () => {
  const { profile, activePropertyId } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  useEffect(() => {
    if (!activePropertyId) return

    const fetchPending = async () => {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('property_id', activePropertyId)
        .eq('status', 'pending')

      setPendingCount(count || 0)
    }

    fetchPending()

    const channel = supabase
      .channel('pending-invoices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices', filter: `property_id=eq.${activePropertyId}` },
        fetchPending
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [activePropertyId])

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      {/* Sidebar — hidden on mobile via CSS, visible on desktop */}
      <Sidebar pendingCount={pendingCount} />

      {/* Main content area — gets margin-left on desktop via CSS */}
      <div className="main-content">
        {/* Topbar — desktop only (hidden on mobile via CSS) */}
        <Topbar onAddInvoice={() => setShowAddInvoice(true)} />

        {/* Mobile header — hidden on desktop via CSS */}
        <MobileHeader pendingCount={pendingCount} />

        <Outlet context={{ pendingCount }} />
      </div>

      {/* Bottom nav — hidden on desktop via CSS */}
      <BottomNav pendingCount={pendingCount} />

      {/* Add Invoice modal — triggered from topbar */}
      {showAddInvoice && (
        <AddInvoiceModal
          onClose={() => setShowAddInvoice(false)}
          onSuccess={() => setShowAddInvoice(false)}
        />
      )}
    </div>
  )
}

export default Layout
