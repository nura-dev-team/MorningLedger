import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { generatePrimeCostAnalysis } from '../lib/claudeApi'
import { fmt, fmtFull, fmtPct, fmtDateShort, getMonthRange, primeCostStatus } from '../lib/utils'

// ── PrimeCost screen ─────────────────────────────────────────────────────────

const PrimeCost = () => {
  const { activePropertyId, activeProperty } = useAuth()
  const propertyId = activePropertyId
  const target = activeProperty?.prime_cost_target ?? 62.0

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { periodYear: year, periodMonth: month } = useAuth()

  // Core data
  const [totalSales, setTotalSales] = useState(0)
  const [fbCogs, setFbCogs] = useState(0)
  const [totalLabor, setTotalLabor] = useState(0)
  const [weeklyData, setWeeklyData] = useState([])
  const [budgetData, setBudgetData] = useState([])
  const [priceChanges, setPriceChanges] = useState([])
  const [foodSpent, setFoodSpent] = useState(0)
  const [bevSpent, setBevSpent] = useState(0)
  const [foodSalesTotal, setFoodSalesTotal] = useState(0)
  const [bevSalesTotal, setBevSalesTotal] = useState(0)
  const [foodBudgetTotal, setFoodBudgetTotal] = useState(0)
  const [foodBudgetRemaining, setFoodBudgetRemaining] = useState(0)

  // AI analysis
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const lastAiKey = useRef(null)

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const { start, end } = getMonthRange(year, month)

    const [salesRes, laborRes, invoiceRes, glRes] = await Promise.all([
      supabase
        .from('sales_entries')
        .select('date, week_number, total_sales, food_sales, beverage_sales')
        .eq('property_id', propertyId)
        .gte('date', start).lte('date', end)
        .order('date'),
      supabase
        .from('labor_entries')
        .select('total_labor')
        .eq('property_id', propertyId)
        .gte('period_start', start).lte('period_end', end),
      supabase
        .from('invoices')
        .select('gl_code, amount, description, invoice_date, vendor_id, vendors(name)')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start).lte('invoice_date', end)
        .order('invoice_date', { ascending: false }),
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

    const salesMtd = sales.reduce((s, r) => s + Number(r.total_sales), 0)
    const laborMtd = labor.reduce((s, l) => s + Number(l.total_labor), 0)

    // F&B codes
    const foodBevCodes = glCodes.filter(g => ['food', 'liquor', 'wine', 'beer'].includes(g.category)).map(g => g.code)
    const cogsMtd = invoices.filter(i => foodBevCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)

    // Food vs Bev spend
    const foodCodes = glCodes.filter(g => g.category === 'food').map(g => g.code)
    const bevCodes = glCodes.filter(g => ['liquor', 'wine', 'beer'].includes(g.category)).map(g => g.code)
    const fSpent = invoices.filter(i => foodCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)
    const bSpent = invoices.filter(i => bevCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)

    // Food / bev sales from sales_entries
    const fSalesTotal = sales.reduce((s, r) => s + Number(r.food_sales || 0), 0)
    const bSalesTotal = sales.reduce((s, r) => s + Number(r.beverage_sales || 0), 0)

    // Food budget
    const foodGl = glCodes.find(g => g.category === 'food')
    const fBudgetTotal = foodGl ? Number(foodGl.monthly_budget) : 0
    const fBudgetRemaining = fBudgetTotal - fSpent

    // Weekly data — aggregate by week_number
    const weekMap = {}
    for (const s of sales) {
      const wk = s.week_number || Math.ceil(new Date(s.date + 'T00:00:00').getDate() / 7)
      weekMap[wk] = (weekMap[wk] || 0) + Number(s.total_sales)
    }
    const weekEntries = Object.entries(weekMap).sort(([a], [b]) => Number(a) - Number(b))
    const maxRevenue = weekEntries.length > 0 ? Math.max(...weekEntries.map(([, v]) => v)) : 1
    const weekly = weekEntries.map(([wk, rev]) => ({
      week: Number(wk),
      label: `W${wk}`,
      revenue: rev,
      pct: maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0,
    }))

    // Budgets
    const spendByGl = {}
    for (const inv of invoices) spendByGl[inv.gl_code] = (spendByGl[inv.gl_code] || 0) + Number(inv.amount)
    const budgets = glCodes.map(gl => ({
      name: gl.name, category: gl.category,
      monthly_budget: Number(gl.monthly_budget),
      spent: spendByGl[gl.code] || 0,
      remaining: Number(gl.monthly_budget) - (spendByGl[gl.code] || 0),
    }))

    // ── Vendor price changes ───────────────────────────────────────────────
    // Group invoices by vendor + GL code, compare amounts across dates
    const vendorGroups = {}
    for (const inv of invoices) {
      const vendorName = inv.vendors?.name
      if (!vendorName) continue
      const key = `${vendorName}::${inv.gl_code}`
      if (!vendorGroups[key]) vendorGroups[key] = { vendor: vendorName, description: inv.description, gl_code: inv.gl_code, invoices: [] }
      vendorGroups[key].invoices.push({ amount: Number(inv.amount), date: inv.invoice_date })
    }

    const changes = []
    for (const group of Object.values(vendorGroups)) {
      if (group.invoices.length < 2) continue
      // Sort by date ascending
      const sorted = [...group.invoices].sort((a, b) => a.date.localeCompare(b.date))
      const oldest = sorted[0]
      const newest = sorted[sorted.length - 1]
      if (oldest.amount === 0 || oldest.date === newest.date) continue
      const pctChange = ((newest.amount - oldest.amount) / oldest.amount) * 100
      // Only show changes > 3%
      if (Math.abs(pctChange) < 3) continue
      changes.push({
        vendor: group.vendor,
        description: group.description || group.gl_code,
        oldAmount: oldest.amount,
        newAmount: newest.amount,
        oldDate: oldest.date,
        newDate: newest.date,
        pctChange,
      })
    }
    // Sort by absolute magnitude
    changes.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))

    setTotalSales(salesMtd)
    setTotalLabor(laborMtd)
    setFbCogs(cogsMtd)
    setWeeklyData(weekly)
    setBudgetData(budgets)
    setPriceChanges(changes.slice(0, 5))
    setFoodSpent(fSpent)
    setBevSpent(bSpent)
    setFoodSalesTotal(fSalesTotal)
    setBevSalesTotal(bSalesTotal)
    setFoodBudgetTotal(fBudgetTotal)
    setFoodBudgetRemaining(fBudgetRemaining)
    setLoading(false)
  }, [propertyId, year, month])

  useEffect(() => { fetchData() }, [fetchData])

  // Derived
  const combined = fbCogs + totalLabor
  const primeCostPct = totalSales > 0 ? (combined / totalSales) * 100 : null
  const fbPct = totalSales > 0 ? (fbCogs / totalSales) * 100 : null
  const laborPct = totalSales > 0 ? (totalLabor / totalSales) * 100 : null
  const fbBarPct = combined > 0 ? (fbCogs / combined) * 100 : 50
  const laborBarPct = combined > 0 ? (totalLabor / combined) * 100 : 50
  const hasData = totalSales > 0 || fbCogs > 0 || totalLabor > 0
  const statusColor = primeCostPct !== null ? `var(--${primeCostStatus(primeCostPct, target)})` : 'var(--text-3)'

  // ── AI analysis — fires when data changes ────────────────────────────────

  useEffect(() => {
    if (!hasData || primeCostPct === null) return

    const key = `${primeCostPct.toFixed(1)}-${totalSales}-${fbCogs}-${totalLabor}`
    if (key === lastAiKey.current) return
    lastAiKey.current = key

    setAiLoading(true)

    const weeklyTrend = weeklyData
      .map(w => `${w.week}:$${Math.round(w.revenue).toLocaleString()}`)
      .join(', ')

    const budgetSummary = budgetData
      .filter(b => b.monthly_budget > 0)
      .map(b => `${b.name}: $${b.spent.toLocaleString()} of $${b.monthly_budget.toLocaleString()} ($${b.remaining.toLocaleString()} left)`)
      .join('; ')

    const priceChangeSummary = priceChanges.length > 0
      ? priceChanges.map(p => `${p.vendor} ${p.description}: ${p.pctChange > 0 ? '+' : ''}${p.pctChange.toFixed(1)}% ($${fmtFull(p.oldAmount)} → $${fmtFull(p.newAmount)})`).join('; ')
      : ''

    generatePrimeCostAnalysis({
      primeCostPct, primeCostTarget: target, totalSales, totalLabor, fbCogs,
      fbPct, laborPct, foodSpent, foodBudgetTotal, foodBudgetRemaining,
      bevSpent, weeklyTrend, budgetSummary, priceChanges: priceChangeSummary,
    }).then(result => {
      setAiAnalysis(result || null)
      setAiLoading(false)
    })
  // Deps are primitives only — the lastAiKey ref guards against duplicate calls
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData, primeCostPct, totalSales, fbCogs, totalLabor])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="screen">
        <div className="screen-hdr">
          <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Prime Cost</div>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
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
        <div className="font-newsreader" style={{ fontSize: '54px', lineHeight: 1, color: hasData ? statusColor : 'var(--text-3)', marginTop: '4px', letterSpacing: '-1.5px' }}>
          {primeCostPct !== null ? fmtPct(primeCostPct) : '—%'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '6px' }}>Target {fmtPct(target)}</div>
        {hasData && (
          <>
            <div style={{ display: 'flex', gap: '3px', height: '6px', borderRadius: '3px', overflow: 'hidden', maxWidth: '300px', margin: '14px auto 4px' }}>
              <div style={{ width: `${fbBarPct}%`, background: 'var(--amber)', borderRadius: '3px' }} />
              <div style={{ width: `${laborBarPct}%`, background: 'var(--orange)', borderRadius: '3px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '12px', color: 'var(--text-3)' }}>
              <span>F&B: {fmtPct(fbPct)}</span><span>Labor: {fmtPct(laborPct)}</span>
            </div>
          </>
        )}
        {!hasData && (
          <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '6px' }}>
            Enter sales and labor to see your prime cost
          </div>
        )}
      </div>

      {/* ── Breakdown card ── */}
      <div className="section-label">Breakdown</div>
      <div className="nura-card">
        {/* F&B COGS row */}
        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 500 }}>Food & Beverage COGS</span>
            <span>
              <strong>{fbPct !== null ? fmtPct(fbPct) : '—%'}</strong>
              {fbPct !== null && fbPct > 30 && (
                <span style={{ fontSize: '10.5px', color: 'var(--amber)', marginLeft: '6px' }}>+{(fbPct - 30).toFixed(1)}%</span>
              )}
            </span>
          </div>
          <div style={{ height: '10px', background: 'var(--surface-alt)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(fbPct || 0, 100)}%`, background: (fbPct || 0) > 35 ? 'var(--amber)' : 'var(--green)', borderRadius: '5px' }} />
          </div>
          {hasData && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{fmt(fbCogs)} invoiced spend · {fmt(totalSales)} revenue</div>}
        </div>

        {/* Labor row */}
        <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 500 }}>Labor</span>
            <span>
              <strong>{laborPct !== null ? fmtPct(laborPct) : '—%'}</strong>
              {laborPct !== null && laborPct > 32 && (
                <span style={{ fontSize: '10.5px', color: 'var(--orange)', marginLeft: '6px' }}>+{(laborPct - 32).toFixed(1)}%</span>
              )}
            </span>
          </div>
          <div style={{ height: '10px', background: 'var(--surface-alt)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(laborPct || 0, 100)}%`, background: (laborPct || 0) > 35 ? 'var(--orange)' : 'var(--green)', borderRadius: '5px' }} />
          </div>
          {hasData && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>{fmt(totalLabor)} total labor cost</div>}
        </div>

        {/* Food vs Beverage Sales split */}
        {(foodSalesTotal > 0 || bevSalesTotal > 0) && (
          <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>Sales Split</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '2px' }}>Food Sales</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{fmt(foodSalesTotal)}</div>
                {totalSales > 0 && <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>{((foodSalesTotal / totalSales) * 100).toFixed(1)}% of revenue</div>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '2px' }}>Beverage Sales</div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{fmt(bevSalesTotal)}</div>
                {totalSales > 0 && <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>{((bevSalesTotal / totalSales) * 100).toFixed(1)}% of revenue</div>}
              </div>
            </div>
          </div>
        )}

        {/* Combined total */}
        {hasData && (
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', fontSize: '14px', fontWeight: 600 }}>
            <span>Combined Prime Cost</span>
            <span>{fmtPct(primeCostPct)}</span>
          </div>
        )}
      </div>

      {/* ── Vendor Price Changes ── */}
      {priceChanges.length > 0 && (
        <>
          <div className="section-label">Vendor Price Changes This Month</div>
          <div className="nura-card" style={{ padding: '4px 16px' }}>
            {priceChanges.map((pc, i) => {
              const isUp = pc.pctChange > 0
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 0',
                    borderBottom: i < priceChanges.length - 1 ? '1px solid var(--border-light)' : 'none',
                  }}
                >
                  {/* Arrow avatar */}
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    background: isUp ? 'var(--amber-bg)' : 'var(--green-bg)',
                    color: isUp ? 'var(--amber)' : 'var(--green)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700,
                  }}>
                    {isUp ? '↑' : '↓'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pc.vendor} — {pc.description}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                      {fmtFull(pc.oldAmount)} → {fmtFull(pc.newAmount)} · {fmtDateShort(pc.newDate)} vs {fmtDateShort(pc.oldDate)}
                    </div>
                  </div>

                  {/* Percentage */}
                  <div style={{
                    fontSize: '11px', fontWeight: 600, flexShrink: 0,
                    color: isUp ? 'var(--amber)' : 'var(--green)',
                  }}>
                    {isUp ? '+' : ''}{pc.pctChange.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Weekly revenue trend — line chart ── */}
      <div className="section-label">Weekly Revenue Trend</div>
      <div className="nura-card" style={{ padding: '16px' }}>
        {weeklyData.length > 1 ? (() => {
          const W = 320, H = 100, padX = 8, padY = 8
          const minRev = Math.min(...weeklyData.map(w => w.revenue))
          const maxRev = Math.max(...weeklyData.map(w => w.revenue))
          const range = maxRev - minRev || 1
          const pts = weeklyData.map((w, i) => {
            const x = padX + (i / (weeklyData.length - 1)) * (W - padX * 2)
            const y = padY + (1 - (w.revenue - minRev) / range) * (H - padY * 2)
            return { x, y, ...w }
          })
          const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
          const areaPath = `${linePath} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`
          const wowChanges = pts.map((p, i) => {
            if (i === 0) return null
            const prev = pts[i - 1].revenue
            return prev > 0 ? ((p.revenue - prev) / prev * 100) : 0
          })

          return (
            <>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '120px' }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green)" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={areaPath} fill="url(#trendFill)" />
                <path d={linePath} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="var(--surface)" stroke="var(--green)" strokeWidth="2" />
                ))}
              </svg>
              {/* Labels + values + WoW change */}
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                {pts.map((p, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '9px', fontWeight: 500, color: 'var(--text-4)' }}>{p.label}</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
                      {p.revenue >= 1000 ? `$${(p.revenue / 1000).toFixed(1)}k` : `$${Math.round(p.revenue)}`}
                    </div>
                    {wowChanges[i] !== null && (
                      <div style={{ fontSize: '9px', fontWeight: 600, color: wowChanges[i] >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {wowChanges[i] >= 0 ? '+' : ''}{wowChanges[i].toFixed(0)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        })() : weeklyData.length === 1 ? (
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-4)', marginBottom: '4px' }}>{weeklyData[0].label}</div>
            <div className="font-newsreader" style={{ fontSize: '22px' }}>{fmt(weeklyData[0].revenue)}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '4px' }}>Only one week of data — trend shows after two weeks</div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', fontSize: '13px', color: 'var(--text-4)' }}>
            Upload sales data to see revenue trend
          </div>
        )}
      </div>

      {/* ── What's driving this (AI) ── */}
      <div className="section-label">What's Driving This</div>
      <div className="nura-csm" style={{ marginBottom: '9px' }}>
        {aiLoading ? (
          <div className="infl">
            <div className="infl-dot" />
            <div style={{ color: 'var(--text-3)' }}>Analyzing your numbers…</div>
          </div>
        ) : (aiAnalysis?.drivingPoints || []).length > 0 ? (
          aiAnalysis.drivingPoints.map((point, i) => (
            <div key={i} className="infl">
              <div className="infl-dot" style={{
                background: i === 0 ? 'var(--orange)' : i === 1 ? 'var(--amber)' : 'var(--green)',
              }} />
              <div dangerouslySetInnerHTML={{ __html: point }} />
            </div>
          ))
        ) : hasData ? (
          <div className="infl">
            <div className="infl-dot" />
            <div>{getFallbackDriving(primeCostPct, totalLabor, totalSales, fbCogs, target)}</div>
          </div>
        ) : (
          <div className="infl">
            <div className="infl-dot" />
            <div style={{ color: 'var(--text-4)' }}>No data yet for this period. Add sales and labor to see insights.</div>
          </div>
        )}
      </div>

      {/* ── What you can still influence (AI) ── */}
      <div className="section-label">What You Can Still Influence</div>
      <div className="nura-csm">
        {aiLoading ? (
          <div className="infl">
            <div className="infl-dot" />
            <div style={{ color: 'var(--text-3)' }}>Generating recommendations…</div>
          </div>
        ) : (aiAnalysis?.influencePoints || []).length > 0 ? (
          aiAnalysis.influencePoints.map((point, i) => (
            <div key={i} className="infl">
              <div className="infl-dot" style={i === aiAnalysis.influencePoints.length - 1 && priceChanges.length > 0 ? { background: 'var(--amber)' } : undefined} />
              <div dangerouslySetInnerHTML={{ __html: point }} />
            </div>
          ))
        ) : hasData ? (
          getFallbackInfluence(budgetData, weeklyData).map((point, i) => (
            <div key={i} className="infl">
              <div className="infl-dot" />
              <div>{point}</div>
            </div>
          ))
        ) : (
          <div className="infl">
            <div className="infl-dot" />
            <div style={{ color: 'var(--text-4)' }}>Every dollar of revenue compresses prime cost. Start by entering last week's sales.</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Fallbacks (when API key missing or call fails) ──────────────────────────

function getFallbackDriving(primeCostPct, totalLabor, totalSales, fbCogs, target) {
  if (primeCostPct > target * 2)
    return `Labor ($${totalLabor.toLocaleString()}) exceeds revenue ($${totalSales.toLocaleString()}). This is a ramp-up pattern — prime cost normalizes as sales grow.`
  if (primeCostPct > target)
    return `Prime cost at ${fmtPct(primeCostPct)} is above target. F&B is $${fbCogs.toLocaleString()} and labor is $${totalLabor.toLocaleString()} against $${totalSales.toLocaleString()} in sales.`
  return `Prime cost is within target at ${fmtPct(primeCostPct)}.`
}

function getFallbackInfluence(budgets, weeklyData) {
  const points = []
  for (const b of budgets) {
    if (b.monthly_budget > 0 && b.remaining > 0) {
      points.push(`Remaining ${b.name.toLowerCase()} budget: $${b.remaining.toLocaleString()}`)
    }
    if (points.length >= 3) break
  }
  if (points.length === 0) points.push('Enter budget targets to see actionable recommendations.')
  return points
}

export default PrimeCost
