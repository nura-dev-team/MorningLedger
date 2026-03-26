import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtPct, getMonthRange, primeCostStatus, getPrimeCostNarrative, getInfluencePoints } from '../lib/utils'

// ── PrimeCost screen ─────────────────────────────────────────────────────────
// Queries sales_entries, labor_entries, and invoices for the current month.

const PrimeCost = () => {
  const { profile } = useAuth()
  const propertyId = profile?.property_id
  const target = profile?.properties?.prime_cost_target ?? 62.0

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Computed data
  const [totalSales, setTotalSales]     = useState(0)
  const [fbCogs, setFbCogs]             = useState(0)
  const [totalLabor, setTotalLabor]     = useState(0)
  const [weeklyData, setWeeklyData]     = useState([])
  const [budgetData, setBudgetData]     = useState([])

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const now = new Date()
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

    const [salesRes, laborRes, invoiceRes, glRes] = await Promise.all([
      supabase
        .from('sales_entries')
        .select('date, week_number, total_sales, food_sales, beverage_sales')
        .eq('property_id', propertyId)
        .gte('date', start)
        .lte('date', end)
        .order('date'),

      supabase
        .from('labor_entries')
        .select('total_labor')
        .eq('property_id', propertyId)
        .gte('period_start', start)
        .lte('period_end', end),

      supabase
        .from('invoices')
        .select('gl_code, amount')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end),

      supabase
        .from('gl_codes')
        .select('code, name, category, monthly_budget')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('sort_order'),
    ])

    if (salesRes.error || laborRes.error || invoiceRes.error) {
      setError((salesRes.error || laborRes.error || invoiceRes.error).message)
      setLoading(false)
      return
    }

    const sales = salesRes.data || []
    const labor = laborRes.data || []
    const invoices = invoiceRes.data || []
    const glCodes = glRes.data || []

    // Total sales MTD (last entry is cumulative, or sum all)
    const salesMtd = sales.length > 0
      ? Math.max(...sales.map((s) => Number(s.total_sales)))
      : 0

    // Total labor MTD
    const laborMtd = labor.reduce((s, l) => s + Number(l.total_labor), 0)

    // F&B COGS from approved invoices
    const cogsMtd = invoices.reduce((s, i) => s + Number(i.amount), 0)

    // Weekly data for bar chart
    const maxRevenue = sales.length > 0 ? Math.max(...sales.map((s) => Number(s.total_sales))) : 1
    const weekly = sales.map((s, idx) => ({
      week: `W${s.week_number || idx + 1}`,
      revenue: Number(s.total_sales),
      pct: maxRevenue > 0 ? (Number(s.total_sales) / maxRevenue) * 100 : 0,
      current: idx === sales.length - 1,
    }))

    // Budget data for influence points
    const spendByGl = {}
    for (const inv of invoices) {
      spendByGl[inv.gl_code] = (spendByGl[inv.gl_code] || 0) + Number(inv.amount)
    }
    const budgets = glCodes.map((gl) => {
      const spent = spendByGl[gl.code] || 0
      return {
        name: gl.name,
        category: gl.category,
        monthly_budget: Number(gl.monthly_budget),
        spent,
        remaining: Number(gl.monthly_budget) - spent,
      }
    })

    setTotalSales(salesMtd)
    setTotalLabor(laborMtd)
    setFbCogs(cogsMtd)
    setWeeklyData(weekly)
    setBudgetData(budgets)
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived calculations
  const combined = fbCogs + totalLabor
  const primeCostPct = totalSales > 0 ? (combined / totalSales) * 100 : null
  const fbPct = totalSales > 0 ? (fbCogs / totalSales) * 100 : null
  const laborPct = totalSales > 0 ? (totalLabor / totalSales) * 100 : null
  const fbBarPct = combined > 0 ? (fbCogs / combined) * 100 : 50
  const laborBarPct = combined > 0 ? (totalLabor / combined) * 100 : 50

  const statusColor = primeCostPct !== null ? `var(--${primeCostStatus(primeCostPct, target)})` : 'var(--nt3)'

  // Narrative
  const drivingPoints = primeCostPct !== null
    ? [getPrimeCostNarrative({ primeCostPct, totalLabor, totalSales, fbCogs })]
    : ['No data yet for this period.']

  const weeklySales = {}
  for (const w of weeklyData) {
    const num = w.week.replace('W', '')
    weeklySales[num] = w.revenue
  }
  const influencePoints = getInfluencePoints({ budgets: budgetData, weeklySales })

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-hdr">
          <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Prime Cost</div>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Prime Cost</div>
        {primeCostPct !== null && (
          <span className={`bdg bdg-${primeCostStatus(primeCostPct, target)}`}>
            {primeCostPct > 100 ? 'Ramp-up' : primeCostPct > target ? 'Elevated' : 'On Track'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {/* ── Big number card ── */}
      <div className="nura-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
        <div className="stat-label">Prime Cost MTD</div>
        <div className="font-newsreader" style={{ fontSize: '66px', lineHeight: 1, color: statusColor, marginTop: '4px' }}>
          {primeCostPct !== null ? fmtPct(primeCostPct) : '—%'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--nt3)', marginTop: '6px' }}>Target {fmtPct(target)}</div>
      </div>

      {/* ── Breakdown card ── */}
      <div className="nura-card">
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '10px' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="stat-label">F&amp;B Cost</div>
            <div className="font-newsreader" style={{ fontSize: '26px' }}>{fbPct !== null ? fmtPct(fbPct) : '—%'}</div>
            <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>{fmt(fbCogs)}</div>
          </div>
          <div style={{ textAlign: 'center', paddingTop: '12px', color: 'var(--nt4)', fontSize: '18px' }}>+</div>
          <div style={{ textAlign: 'center' }}>
            <div className="stat-label">Labor</div>
            <div className="font-newsreader" style={{ fontSize: '26px' }}>{laborPct !== null ? fmtPct(laborPct) : '—%'}</div>
            <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>{fmt(totalLabor)}</div>
          </div>
          <div style={{ textAlign: 'center', paddingTop: '12px', color: 'var(--nt4)', fontSize: '18px' }}>=</div>
          <div style={{ textAlign: 'center' }}>
            <div className="stat-label">Combined</div>
            <div className="font-newsreader" style={{ fontSize: '26px', color: statusColor }}>{primeCostPct !== null ? fmtPct(primeCostPct) : '—%'}</div>
            <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>{fmt(combined)}</div>
          </div>
        </div>

        {/* Stacked bar */}
        <div style={{ display: 'flex', height: '8px', borderRadius: '6px', overflow: 'hidden', margin: '8px 0' }}>
          <div style={{ width: `${fbBarPct}%`, background: 'var(--green)' }} />
          <div style={{ width: `${laborBarPct}%`, background: 'var(--amber)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--green)' }} />
            <span style={{ fontSize: '11px', color: 'var(--nt3)' }}>F&amp;B</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--amber)' }} />
            <span style={{ fontSize: '11px', color: 'var(--nt3)' }}>Labor</span>
          </div>
        </div>
      </div>

      {/* ── Weekly revenue trend ── */}
      {weeklyData.length > 0 && (
        <>
          <div className="section-label">Weekly Revenue Trend</div>
          <div className="nura-csm">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '76px' }}>
              {weeklyData.map(({ week, revenue, pct, current }) => (
                <div key={week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--nt2)', fontWeight: '500' }}>
                    {revenue >= 1000 ? `$${(revenue / 1000).toFixed(1)}k` : `$${revenue}`}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                    <div
                      style={{
                        width: '100%',
                        height: `${pct}%`,
                        borderRadius: '3px 3px 0 0',
                        background: current ? 'var(--nt)' : 'var(--nsurf-alt)',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--nt4)' }}>{week}{current ? ' \u2191' : ''}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── What's driving this ── */}
      {drivingPoints.length > 0 && (
        <>
          <div className="section-label">What's Driving This</div>
          <div className="nura-csm" style={{ marginBottom: '9px' }}>
            {drivingPoints.map((point, i) => (
              <div key={i} className="infl">
                <div className="infl-dot" />
                <div>{point}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── What you can still influence ── */}
      {influencePoints.length > 0 && (
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

export default PrimeCost
