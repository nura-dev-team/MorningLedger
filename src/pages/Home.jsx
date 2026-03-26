import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import AddInvoiceModal from '../components/AddInvoiceModal'
import {
  fmt,
  fmtFull,
  fmtPct,
  fmtDateShort,
  fmtPeriodLabel,
  getMonthRange,
  primeCostStatus,
  getPrimeCostNarrative,
  getInfluencePoints,
} from '../lib/utils'

// ─── Skeleton loader ────────────────────────────────────────────────────────

const Skel = ({ w = '100%', h = '16px', style = {} }) => (
  <div className="skeleton" style={{ width: w, height: h, borderRadius: '6px', ...style }} />
)

// ─── Status badge ───────────────────────────────────────────────────────────

const primeCostBadge = (status) => {
  const map = {
    amber:  { label: 'Ramp-up',       cls: 'bdg bdg-amber' },
    green:  { label: 'Healthy',       cls: 'bdg bdg-green' },
    orange: { label: 'Action needed', cls: 'bdg bdg-orange' },
  }
  return map[status] || map.amber
}

// ─── Main component ─────────────────────────────────────────────────────────

const Home = () => {
  const { profile } = useAuth()
  const propertyId   = profile?.property_id
  const propertyName = profile?.properties?.name || 'NURA'

  // Period navigation
  const [year,  setYear]  = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [periodReady, setPeriodReady] = useState(false)

  // Add invoice modal
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  // Data
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // On mount: use current month (period nav lets user browse history)
  useEffect(() => {
    if (!propertyId) return
    setPeriodReady(true)
  }, [propertyId])

  // Fetch all dashboard data for the selected period
  const fetchDashboard = useCallback(async () => {
    if (!propertyId || !periodReady) return
    setLoading(true)
    setError(null)

    const { start, end } = getMonthRange(year, month)

    try {
      const [salesRes, laborRes, invoicesRes, glCodesRes] = await Promise.all([
        supabase
          .from('sales_entries')
          .select('*')
          .eq('property_id', propertyId)
          .gte('date', start)
          .lte('date', end)
          .order('week_number'),

        supabase
          .from('labor_entries')
          .select('*')
          .eq('property_id', propertyId)
          .lte('period_start', end)
          .gte('period_end', start),

        supabase
          .from('invoices')
          .select('*, vendors(name, default_gl_code)')
          .eq('property_id', propertyId)
          .gte('invoice_date', start)
          .lte('invoice_date', end)
          .order('invoice_date', { ascending: false }),

        supabase
          .from('gl_codes')
          .select('*')
          .eq('property_id', propertyId)
          .eq('is_active', true)
          .order('sort_order'),
      ])

      if (salesRes.error) throw salesRes.error
      if (laborRes.error) throw laborRes.error
      if (invoicesRes.error) throw invoicesRes.error
      if (glCodesRes.error) throw glCodesRes.error

      const sales         = salesRes.data || []
      const labor         = laborRes.data || []
      const allInvoices   = invoicesRes.data || []
      const glCodes       = glCodesRes.data || []

      const approved = allInvoices.filter((i) => i.status === 'approved')
      const pending  = allInvoices.filter((i) => i.status === 'pending')

      // ── Totals ────────────────────────────────────────────────────────────
      const totalSales = sales.reduce((s, r) => s + Number(r.total_sales), 0)
      const totalLabor = labor.reduce((s, r) => s + Number(r.total_labor), 0)

      const foodBevCodes = glCodes
        .filter((g) => ['food', 'liquor', 'wine', 'beer'].includes(g.category))
        .map((g) => g.code)

      const fbCogs = approved
        .filter((i) => foodBevCodes.includes(i.gl_code))
        .reduce((s, i) => s + Number(i.amount), 0)

      const primeCostPct = totalSales > 0
        ? ((fbCogs + totalLabor) / totalSales) * 100
        : 0

      const fbCogsAllPct = totalSales > 0 ? (fbCogs / totalSales) * 100 : 0
      const laborPct     = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0

      // ── Budget summaries ──────────────────────────────────────────────────
      const budgets = glCodes.map((gl) => {
        const spent = approved
          .filter((i) => i.gl_code === gl.code)
          .reduce((s, i) => s + Number(i.amount), 0)
        const remaining    = Number(gl.monthly_budget) - spent
        const utilizationPct = gl.monthly_budget > 0 ? (spent / Number(gl.monthly_budget)) * 100 : 0
        return { ...gl, spent, remaining, utilizationPct }
      })

      // ── Food budget for the headline stat ────────────────────────────────
      const foodBudget = budgets.find((b) => b.category === 'food')

      // ── Weekly sales map ─────────────────────────────────────────────────
      const weeklySales = sales.reduce((acc, s) => {
        const wk = s.week_number || 1
        acc[wk] = (acc[wk] || 0) + Number(s.total_sales)
        return acc
      }, {})

      // ── Recent transactions (last 5 approved) ────────────────────────────
      const recentTransactions = approved.slice(0, 5)

      setData({
        totalSales,
        totalLabor,
        fbCogs,
        fbCogsAllPct,
        laborPct,
        primeCostPct,
        primeCostTarget: profile?.properties?.prime_cost_target || 62,
        budgets,
        foodBudget,
        weeklySales,
        recentTransactions,
        pendingCount: pending.length,
        glCodes,
      })
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [propertyId, year, month, periodReady, profile?.properties?.prime_cost_target])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // ── Period navigation ──────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // ── Status ────────────────────────────────────────────────────────────────
  const status  = data ? primeCostStatus(data.primeCostPct, data.primeCostTarget) : 'amber'
  const badge   = primeCostBadge(status)
  const narrative = data
    ? getPrimeCostNarrative({
        primeCostPct: data.primeCostPct,
        totalLabor:   data.totalLabor,
        totalSales:   data.totalSales,
        fbCogs:       data.fbCogs,
      })
    : ''
  const influencePoints = data
    ? getInfluencePoints({ budgets: data.budgets, weeklySales: data.weeklySales })
    : []

  const periodLabel = fmtPeriodLabel(year, month)
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="screen">

      {/* ── Header ── */}
      <div className="screen-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="nura-logo">NURA</div>
          <Link
            to="/settings/admin"
            style={{ color: 'var(--nt4)', fontSize: '16px', lineHeight: 1, textDecoration: 'none' }}
            title="Settings"
          >
            ⚙
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Period selector */}
          <button onClick={prevMonth} style={navBtnStyle}>‹</button>
          <span style={{ fontSize: '12px', color: 'var(--nt4)', minWidth: '80px', textAlign: 'center' }}>
            {periodLabel}
          </span>
          <button onClick={nextMonth} style={navBtnStyle}>›</button>

          {/* Add invoice */}
          <button
            onClick={() => setShowAddInvoice(true)}
            style={{
              background: 'var(--nt)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              fontSize: '18px',
              lineHeight: '1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="Add invoice"
          >
            +
          </button>
        </div>
      </div>

      {showAddInvoice && (
        <AddInvoiceModal
          onClose={() => setShowAddInvoice(false)}
          onSuccess={() => { setShowAddInvoice(false); fetchDashboard() }}
        />
      )}

      {error && (
        <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* ── Prime Cost MTD card ── */}
      <div className="nura-card">
        <div className="stat-label">Prime Cost MTD</div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '4px 0 8px' }}>
            <Skel w="160px" h="54px" />
            <Skel w="60px" h="22px" />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div
              className="font-newsreader"
              style={{
                fontSize: '54px',
                lineHeight: 1,
                color: status === 'green' ? 'var(--green)' : status === 'orange' ? 'var(--orange)' : 'var(--amber)',
              }}
            >
              {data ? fmtPct(data.primeCostPct) : '—%'}
            </div>
            <span className={badge.cls}>{badge.label}</span>
          </div>
        )}

        <div style={{ marginTop: '5px', fontSize: '13px', color: 'var(--nt3)' }}>
          Target: {data ? fmtPct(data.primeCostTarget) : '62.0%'}
        </div>
      </div>

      {/* ── Status narrative ── */}
      {loading ? (
        <div style={{ marginBottom: '12px' }}>
          <Skel h="54px" style={{ borderRadius: '0 var(--r-sm) var(--r-sm) 0' }} />
        </div>
      ) : narrative ? (
        <div className={`note-${status === 'green' ? 'green' : status === 'orange' ? 'orange' : 'amber'}`}>
          {narrative}
        </div>
      ) : null}

      {/* ── 2×2 stat grid ── */}
      <div className="stat-grid">
        <div className="stat-cell">
          <div className="stat-label">Sales MTD</div>
          {loading ? <Skel w="80px" h="28px" style={{ margin: '3px 0' }} /> : (
            <div className="stat-val">{fmt(data?.totalSales || 0)}</div>
          )}
          <div className="stat-sub">
            {Object.keys(data?.weeklySales || {}).length} weeks
          </div>
        </div>

        <div className="stat-cell">
          <div className="stat-label">Food Budget Left</div>
          {loading ? <Skel w="70px" h="28px" style={{ margin: '3px 0' }} /> : (
            <div
              className="stat-val"
              style={{ color: (data?.foodBudget?.remaining || 0) >= 0 ? 'var(--green)' : 'var(--orange)' }}
            >
              {data?.foodBudget ? fmt(data.foodBudget.remaining) : '$—'}
            </div>
          )}
          <div className="stat-sub">
            of {data?.foodBudget ? fmt(data.foodBudget.monthly_budget) : '—'}
          </div>
        </div>

        <div className="stat-cell">
          <div className="stat-label">F&amp;B COGS</div>
          {loading ? <Skel w="70px" h="28px" style={{ margin: '3px 0' }} /> : (
            <div className="stat-val">{fmt(data?.fbCogs || 0)}</div>
          )}
          <div className="stat-sub">
            {data ? fmtPct(data.fbCogsAllPct) : '—'} of sales
          </div>
        </div>

        <div className="stat-cell">
          <div className="stat-label">Labor</div>
          {loading ? <Skel w="70px" h="28px" style={{ margin: '3px 0' }} /> : (
            <div className="stat-val">{fmt(data?.totalLabor || 0)}</div>
          )}
          <div className="stat-sub">
            {data ? fmtPct(data.laborPct) : '—'} of sales
          </div>
        </div>
      </div>

      {/* ── Recent Transactions ── */}
      <div className="section-label">Recent Transactions</div>
      <div className="nura-csm">
        {loading ? (
          [1,2,3,4,5].map((n) => (
            <div key={n} className="txr">
              <Skel w="55%" h="14px" />
              <Skel w="25%" h="14px" />
            </div>
          ))
        ) : data?.recentTransactions?.length > 0 ? (
          data.recentTransactions.map((inv) => (
            <div key={inv.id} className="txr">
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>{inv.vendors?.name || 'Unknown'}</div>
                <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
                  {inv.description} · {fmtDateShort(inv.invoice_date)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{fmtFull(Number(inv.amount))}</div>
                <span className="gl-pill">{inv.gl_code}</span>
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--nt4)', padding: '8px 0', textAlign: 'center' }}>
            No transactions this period.{' '}
            <Link to="/approvals" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Add an invoice →</Link>
          </div>
        )}
      </div>

      {/* ── What You Can Still Influence ── */}
      {!loading && influencePoints.length > 0 && (
        <>
          <div className="section-label">What You Can Still Influence</div>
          <div className="nura-csm">
            {influencePoints.map((point, i) => (
              <div key={i} className="infl">
                <div className="infl-dot" />
                <div>{point}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const navBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--nt4)',
  fontSize: '18px',
  padding: '2px 4px',
  lineHeight: 1,
}

export default Home
