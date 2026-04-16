import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { generateDashboardNarrative } from '../lib/claudeApi'
import AddInvoiceModal from '../components/AddInvoiceModal'
import {
  fmt,
  fmtFull,
  fmtPct,
  fmtDateShort,
  fmtPeriodLabel,
  getMonthRange,
  primeCostStatus,
} from '../lib/utils'

// ─── Skeleton / Ghost ────────────────────────────────────────────────────────

const Skel = ({ w = '100%', h = '16px', style = {} }) => (
  <div className="skeleton" style={{ width: w, height: h, borderRadius: '6px', ...style }} />
)
const Ghost = ({ w = '100%', h = '16px', style = {} }) => (
  <div className="ghost" style={{ width: w, height: h, ...style }} />
)

// ─── Vendor initials + color for avatar ──────────────────────────────────────

const AVATAR_COLORS = [
  { bg: 'var(--green-bg)', color: 'var(--green)' },
  { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  { bg: 'var(--blue-bg)', color: 'var(--blue)' },
  { bg: 'var(--purple-bg)', color: 'var(--purple)' },
]

function vendorAvatar(name) {
  if (!name) return { initials: '?', bg: 'var(--surface-alt)', color: 'var(--text-4)' }
  const words = name.trim().split(/\s+/)
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  const idx = name.length % AVATAR_COLORS.length
  return { initials, ...AVATAR_COLORS[idx] }
}

// ─── Main component ─────────────────────────────────────────────────────────

const Home = () => {
  const { profile, activePropertyId, activeProperty } = useAuth()
  const [searchParams] = useSearchParams()
  const setupPending = searchParams.get('setup') === 'pending'
  const propertyId = activePropertyId

  const { periodYear: year, setPeriodYear: setYear, periodMonth: month, setPeriodMonth: setMonth, periodAutoDetected, setPeriodAutoDetected } = useAuth()
  const [periodReady, setPeriodReady] = useState(false)
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // AI narratives
  const [narrative, setNarrative] = useState(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const lastNarrativeKey = useRef(null)

  useEffect(() => { if (propertyId) setPeriodReady(true) }, [propertyId])

  // Auto-detect: if current month has no sales data, jump to the latest month that does (once)
  useEffect(() => {
    if (!propertyId || periodAutoDetected) return
    setPeriodAutoDetected(true)
    const now = new Date()
    const curStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const curEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`
    supabase.from('sales_entries').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).gte('date', curStart).lte('date', curEnd)
      .then(({ count }) => {
        if (count > 0) return
        supabase.from('sales_entries').select('date').eq('property_id', propertyId).order('date', { ascending: false }).limit(1)
          .then(({ data: rows }) => {
            if (rows?.[0]?.date) {
              const d = new Date(rows[0].date + 'T00:00:00')
              setYear(d.getFullYear())
              setMonth(d.getMonth() + 1)
            }
          })
      })
  }, [propertyId, periodAutoDetected, setPeriodAutoDetected, setYear, setMonth])

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    if (!propertyId || !periodReady) return
    setLoading(true); setError(null)
    const { start, end } = getMonthRange(year, month)

    try {
      const [salesRes, laborRes, invoicesRes, glCodesRes] = await Promise.all([
        supabase.from('sales_entries').select('*').eq('property_id', propertyId).gte('date', start).lte('date', end).order('week_number'),
        supabase.from('labor_entries').select('*').eq('property_id', propertyId).lte('period_start', end).gte('period_end', start),
        supabase.from('invoices').select('*, vendors(name, default_gl_code)').eq('property_id', propertyId).gte('invoice_date', start).lte('invoice_date', end).order('invoice_date', { ascending: false }),
        supabase.from('gl_codes').select('*').eq('property_id', propertyId).eq('is_active', true).order('sort_order'),
      ])
      if (salesRes.error) throw salesRes.error
      if (laborRes.error) throw laborRes.error
      if (invoicesRes.error) throw invoicesRes.error
      if (glCodesRes.error) throw glCodesRes.error

      const sales = salesRes.data || [], labor = laborRes.data || []
      const allInvoices = invoicesRes.data || [], glCodes = glCodesRes.data || []
      const approved = allInvoices.filter(i => i.status === 'approved')
      const pending = allInvoices.filter(i => i.status === 'pending')

      const totalSales = sales.reduce((s, r) => s + Number(r.total_sales), 0)
      const totalLabor = labor.reduce((s, r) => s + Number(r.total_labor), 0)

      const foodBevCodes = glCodes.filter(g => ['food','liquor','wine','beer'].includes(g.category)).map(g => g.code)
      const fbCogs = approved.filter(i => foodBevCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)
      const primeCostPct = totalSales > 0 ? ((fbCogs + totalLabor) / totalSales) * 100 : 0
      const fbCogsAllPct = totalSales > 0 ? (fbCogs / totalSales) * 100 : 0
      const laborPct = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0

      const budgets = glCodes.map(gl => {
        const spent = approved.filter(i => i.gl_code === gl.code).reduce((s, i) => s + Number(i.amount), 0)
        return { ...gl, spent, remaining: Number(gl.monthly_budget) - spent, utilizationPct: gl.monthly_budget > 0 ? (spent / Number(gl.monthly_budget)) * 100 : 0 }
      })
      const foodBudget = budgets.find(b => b.category === 'food')
      const totalCogsBudget = budgets.filter(b => ['food','liquor','wine','beer'].includes(b.category)).reduce((s, b) => s + Number(b.monthly_budget), 0)

      const weeklySales = sales.reduce((acc, s) => { acc[s.week_number || 1] = (acc[s.week_number || 1] || 0) + Number(s.total_sales); return acc }, {})

      const foodCodes = glCodes.filter(g => g.category === 'food').map(g => g.code)
      const bevCodes = glCodes.filter(g => ['liquor','wine','beer'].includes(g.category)).map(g => g.code)
      const foodSpent = approved.filter(i => foodCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)
      const bevSpent = approved.filter(i => bevCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)
      const foodSales = sales.reduce((s, r) => s + Number(r.food_sales || 0), 0)
      const bevSales = sales.reduce((s, r) => s + Number(r.beverage_sales || 0), 0)

      setData({
        totalSales, totalLabor, fbCogs, fbCogsAllPct, laborPct, primeCostPct,
        primeCostTarget: activeProperty?.prime_cost_target || 62,
        budgets, foodBudget, totalCogsBudget, weeklySales,
        recentTransactions: approved.slice(0, 5),
        pendingCount: pending.length, glCodes,
        foodSpent, bevSpent, foodSales, bevSales,
      })
    } catch (err) { setError(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [propertyId, year, month, periodReady, activeProperty?.prime_cost_target])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  // ── AI narrative ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!data || !hasRealData(data)) return
    const key = `${data.primeCostPct.toFixed(1)}-${data.totalSales}-${data.fbCogs}-${data.totalLabor}-${data.pendingCount}`
    if (key === lastNarrativeKey.current) return
    lastNarrativeKey.current = key
    setNarrativeLoading(true)
    const weeklyTrend = Object.entries(data.weeklySales).sort(([a],[b]) => Number(a)-Number(b)).map(([wk,rev]) => `W${wk}:$${Math.round(rev).toLocaleString()}`).join(', ')
    generateDashboardNarrative({
      primeCostPct: data.primeCostPct, primeCostTarget: data.primeCostTarget,
      totalSales: data.totalSales, totalLabor: data.totalLabor, fbCogs: data.fbCogs,
      foodBudgetRemaining: data.foodBudget?.remaining ?? 0, foodBudgetTotal: data.foodBudget ? Number(data.foodBudget.monthly_budget) : 0,
      laborPct: data.laborPct, fbCogsPct: data.fbCogsAllPct, weeklyTrend,
      pendingCount: data.pendingCount, foodSpent: data.foodSpent, foodSales: data.foodSales, bevSpent: data.bevSpent, bevSales: data.bevSales,
    }).then(r => { setNarrative(r || null); setNarrativeLoading(false) })
  }, [data])

  // ── Derived ───────────────────────────────────────────────────────────────

  const status = data ? primeCostStatus(data.primeCostPct, data.primeCostTarget) : 'amber'
  const periodLabel = fmtPeriodLabel(year, month)
  const hasData = data && hasRealData(data)
  const foodCostPct = data && data.foodSales > 0 ? (data.foodSpent / data.foodSales) * 100 : null
  const bevCostPct = data && data.bevSales > 0 ? (data.bevSpent / data.bevSales) * 100 : null
  const cogsUtilPct = data && data.totalCogsBudget > 0 ? (data.fbCogs / data.totalCogsBudget) * 100 : 0
  const weekEntries = data ? Object.entries(data.weeklySales).sort(([a],[b]) => Number(a)-Number(b)) : []
  const maxWeekRev = weekEntries.length > 0 ? Math.max(...weekEntries.map(([,v]) => v)) : 1
  const statusKey = status === 'green' ? 'green' : status === 'orange' ? 'orange' : 'amber'

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12) } else setMonth(m => m-1) }
  const nextMonth = () => { const n = new Date(); if (year === n.getFullYear() && month === n.getMonth()+1) return; if (month === 12) { setYear(y => y+1); setMonth(1) } else setMonth(m => m+1) }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="screen">

      {/* Setup pending */}
      {setupPending && (
        <div style={{ background: 'var(--amber-bg)', borderLeft: '3px solid var(--amber)', borderRadius: '0 var(--r-sm) var(--r-sm) 0', padding: '14px 16px', marginBottom: '14px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Setup in progress</div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5 }}>Waiting for your Controller to complete financial configuration.</div>
        </div>
      )}

      {/* Desktop period nav */}
      <div className="screen-hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <span style={{ fontSize: '12px', color: 'var(--text-4)', minWidth: '80px', textAlign: 'center' }}>{periodLabel}</span>
          <button onClick={nextMonth} style={navBtn}>›</button>
        </div>
      </div>

      {error && <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

      {/* ── 1. Status pill (AI) ── */}
      {!loading && hasData && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 18px', borderRadius: 'var(--r)', fontSize: '13.5px', lineHeight: 1.5, marginBottom: '14px', background: `var(--${statusKey}-bg)`, color: `var(--${statusKey})`, border: `1px solid var(--${statusKey}-border)` }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'currentColor', flexShrink: 0, marginTop: '5px' }} />
          <span>{narrativeLoading ? 'Analyzing…' : narrative?.statusPill || getFallbackStatus(data)}</span>
        </div>
      )}

      {/* ── 2. Predictive alert (AI) ── */}
      {!loading && hasData && (narrative?.predictiveAlert || narrativeLoading) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 18px', borderRadius: 'var(--r)', fontSize: '13.5px', lineHeight: 1.5, marginBottom: '14px', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green-border)' }}>
          <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>◎</span>
          <span>{narrativeLoading ? 'Generating forecast…' : narrative.predictiveAlert}</span>
        </div>
      )}

      {/* ── 3. Stats grid (3-col desktop, 1+2 mobile) ── */}
      {!loading && hasData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {/* Prime Cost MTD */}
          <StatCard label="Prime Cost — MTD" sub={`Target: ${fmtPct(data.primeCostTarget)} · ${status === 'green' ? 'Healthy' : 'Ramp-up pattern'}`}>
            <div className="font-newsreader" style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.5px', color: `var(--${statusKey})` }}>
              {fmtPct(data.primeCostPct)}
            </div>
          </StatCard>
          {/* Sales MTD */}
          <StatCard label="Sales MTD" sub={weekEntries.length > 0 ? `↑ Week ${weekEntries[weekEntries.length-1][0]} strongest at ${fmt(weekEntries[weekEntries.length-1][1])}` : periodLabel}>
            <div className="font-newsreader" style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.5px' }}>
              {fmt(data.totalSales)}
            </div>
          </StatCard>
          {/* Remaining Food Budget */}
          <StatCard label="Remaining Food Budget" sub={data.foodBudget ? `of ${fmt(data.foodBudget.monthly_budget)} monthly budget` : '—'}>
            <div className="font-newsreader" style={{ fontSize: '24px', fontWeight: 400, letterSpacing: '-0.5px' }}>
              {data.foodBudget ? fmt(data.foodBudget.remaining) : '$—'}
            </div>
          </StatCard>
        </div>
      ) : !loading ? (
        /* Ghost stat cards */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {['Prime Cost', 'Sales MTD', 'Food Budget'].map(l => (
            <StatCard key={l} label={l} sub="Pending data">
              <Ghost w="80px" h="28px" style={{ borderRadius: '4px', marginTop: '4px' }} />
            </StatCard>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
          {[1,2,3].map(n => (
            <div key={n} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
              <Skel w="70%" h="10px" style={{ marginBottom: '8px' }} />
              <Skel w="50%" h="28px" />
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Email pipeline ── */}
      {!loading && hasData && (
        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 'var(--r-sm)', padding: '14px 16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', flexShrink: 0, animation: 'ghost-pulse 2s infinite' }} />
          <div style={{ fontSize: '13px', color: 'var(--green)' }}>
            <strong>Email-to-ledger active</strong> — {data.recentTransactions.length + data.pendingCount} invoices ingested this month.
          </div>
        </div>
      )}

      {/* ── 5. COGS Spend vs Budget ── */}
      {!loading && hasData && data.totalCogsBudget > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-4)' }}>COGS Spend vs Budget</span>
          </div>
          <div style={{ padding: '4px 20px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
              <span style={{ fontWeight: 500 }}>Total COGS</span>
              <span style={{ color: 'var(--text-3)' }}>{fmt(data.fbCogs)} of {fmt(data.totalCogsBudget)} budget</span>
            </div>
            <div style={{ height: '12px', background: 'var(--surface-alt)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(cogsUtilPct, 100)}%`, background: cogsUtilPct > 100 ? 'var(--orange)' : 'var(--green)', borderRadius: '4px', transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-3)', marginTop: '5px' }}>
              <span>{cogsUtilPct.toFixed(1)}% utilized</span>
              <span>{fmt(data.totalCogsBudget - data.fbCogs)} remaining</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Explain block (AI) ── */}
      {!loading && hasData && (narrative?.explainBlock || narrativeLoading) && (
        <Explain>{narrativeLoading ? 'Analyzing spend patterns…' : narrative.explainBlock}</Explain>
      )}

      {/* ── 7. Two-col: Weekly Revenue | Live F&B Cost vs Sales ── */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          {/* Weekly Revenue — bar chart */}
          <Card title="Weekly Revenue">
            {weekEntries.length > 0 ? (
              <>
                {/* Bars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px', marginBottom: '6px' }}>
                  {weekEntries.map(([wk, rev], idx) => {
                    const pct = Math.max((rev / maxWeekRev) * 100, 4)
                    const isMax = rev === maxWeekRev
                    const isMin = rev === Math.min(...weekEntries.map(([,v]) => v))
                    return (
                      <div key={wk} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                        <div style={{
                          width: '100%', height: `${pct}%`, minHeight: '4px',
                          borderRadius: '4px 4px 1px 1px',
                          background: isMax ? 'var(--green)' : isMin ? 'var(--orange)' : 'var(--amber)',
                          transition: 'height 0.4s ease',
                        }} />
                      </div>
                    )
                  })}
                </div>
                {/* Labels row */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                  {weekEntries.map(([wk]) => (
                    <div key={wk} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: 500, color: 'var(--text-4)' }}>Wk {wk}</div>
                  ))}
                </div>
                {/* Values row */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {weekEntries.map(([wk, rev], idx) => {
                    const isMax = rev === maxWeekRev
                    return (
                      <div key={wk} style={{ flex: 1, textAlign: 'center', fontSize: '10px', fontWeight: isMax ? 700 : 400, color: isMax ? 'var(--green)' : 'var(--text-3)' }}>
                        {rev >= 1000 ? `$${(rev/1000).toFixed(1)}k` : `$${Math.round(rev)}`}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100px', marginBottom: '6px' }}>
                  {[10,18,28,50,80].map((h,i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                      <div className="ghost" style={{ width: '100%', height: `${h}%`, borderRadius: '4px 4px 1px 1px' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[1,2,3,4,5].map(w => (
                    <div key={w} style={{ flex: 1, textAlign: 'center', fontSize: '9px', fontWeight: 500, color: 'var(--text-4)' }}>Wk {w}</div>
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Live F&B Cost vs Sales */}
          <Card title="Live F&B Cost vs Sales">
            {hasData && (foodCostPct !== null || bevCostPct !== null) ? (
              <>
                {foodCostPct !== null && (
                  <BdownRow label="Food" pct={foodCostPct} target={30} />
                )}
                {bevCostPct !== null && (
                  <BdownRow label="Beverage" pct={bevCostPct} target={20} />
                )}
                <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginTop: '12px', padding: '10px 12px', background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--border)' }}>
                  {foodCostPct !== null && foodCostPct > 30
                    ? `Food spend is high relative to food sales at low volume.`
                    : foodCostPct !== null ? `Food cost is controlled.` : ''}
                  {bevCostPct !== null && bevCostPct <= 20 ? ' Beverage cost is healthy.' : ''}
                </div>
              </>
            ) : (
              <>
                <Ghost w="100%" h="8px" style={{ borderRadius: '4px', marginBottom: '14px' }} />
                <Ghost w="100%" h="8px" style={{ borderRadius: '4px' }} />
              </>
            )}
          </Card>
        </div>
      )}

      {/* ── 8. Recent Transactions ── */}
      {!loading && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: '14px' }}>
          <div style={{ padding: '16px 20px 12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-4)' }}>Recent Transactions</span>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            {data?.recentTransactions?.length > 0 ? (
              data.recentTransactions.map((inv, idx) => {
                const av = vendorAvatar(inv.vendors?.name)
                const source = inv.extraction_confidence > 0 ? 'scan' : 'email'
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: '12px', borderBottom: idx < data.recentTransactions.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0, background: av.bg, color: av.color }}>
                      {av.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>
                        {inv.vendors?.name || 'Unknown'}{' '}
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.3px', background: source === 'email' ? 'var(--blue-bg)' : 'var(--surface-alt)', color: source === 'email' ? 'var(--blue)' : 'var(--text-3)' }}>{source}</span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
                        {inv.description} · {fmtDateShort(inv.invoice_date)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>{fmtFull(Number(inv.amount))}</div>
                    </div>
                  </div>
                )
              })
            ) : (
              <>
                {[1,2,3].map(n => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: '12px', borderBottom: '1px solid var(--border-light)' }}>
                    <Ghost w="38px" h="38px" style={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <Ghost w={n === 1 ? '50%' : '40%'} h="14px" style={{ borderRadius: '4px', marginBottom: '8px' }} />
                      <Ghost w="65%" h="10px" style={{ borderRadius: '3px' }} />
                    </div>
                    <Ghost w="50px" h="14px" style={{ borderRadius: '4px' }} />
                  </div>
                ))}
                <button onClick={() => setShowAddInvoice(true)} style={{ display: 'block', width: '100%', marginTop: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--amber)', fontSize: '13px', fontWeight: 500, fontFamily: "'DM Sans', sans-serif", padding: '8px 0', textAlign: 'center' }}>
                  Add your first invoice →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 9. Bottom explain (data-driven) ── */}
      {!loading && hasData && (data.foodBudget || weekEntries.length > 0) && (
        <Explain>
          Remaining food budget: <strong>{data.foodBudget ? fmt(data.foodBudget.remaining) : '$—'}</strong>.
          {data.budgets.filter(b => b.spent === 0 && b.monthly_budget > 0).length > 0 && (
            <> {data.budgets.filter(b => b.spent === 0 && b.monthly_budget > 0).map(b => `${b.name}: ${fmt(b.monthly_budget)}`).join(', ')} untouched.</>
          )}
          {weekEntries.length > 0 && (
            <> Week {weekEntries[weekEntries.length-1][0]} pace: <strong>{fmt(weekEntries[weekEntries.length-1][1])}</strong>.</>
          )}
        </Explain>
      )}

      {showAddInvoice && (
        <AddInvoiceModal onClose={() => setShowAddInvoice(false)} onSuccess={() => { setShowAddInvoice(false); fetchDashboard() }} />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, sub, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px' }}>
      <div style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-4)', marginBottom: '8px' }}>{label}</div>
      {children}
      <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '3px' }}>{sub}</div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px 12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-4)' }}>{title}</span>
      </div>
      <div style={{ padding: '4px 20px 20px' }}>{children}</div>
    </div>
  )
}

function BdownRow({ label, pct, target }) {
  const over = pct > target
  const delta = Math.abs(pct - target).toFixed(1)
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border-light)' }}>
      <div style={{ width: '80px', fontSize: '13.5px', fontWeight: 500, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, margin: '0 16px' }}>
        <div style={{ height: '8px', background: 'var(--surface-alt)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: over ? 'var(--amber)' : 'var(--green)', borderRadius: '4px', transition: 'width 0.6s' }} />
        </div>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', whiteSpace: 'nowrap', minWidth: '100px', textAlign: 'right' }}>
        <strong style={{ color: 'var(--text)' }}>{fmtPct(pct)}</strong>{' '}
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '10px', background: over ? 'var(--amber-bg)' : 'var(--green-bg)', color: over ? 'var(--amber)' : 'var(--green)' }}>
          {over ? '+' : '−'}{delta}%
        </span>
      </div>
    </div>
  )
}

function Explain({ children }) {
  return (
    <div style={{ fontSize: '13.5px', color: 'var(--text-2)', lineHeight: 1.6, padding: '14px 16px', background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--border)', marginBottom: '14px' }}>
      {children}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasRealData(d) { return d && (d.totalSales > 0 || d.fbCogs > 0 || d.totalLabor > 0) }

function getFallbackStatus(data) {
  if (!data) return ''
  if (data.primeCostPct > data.primeCostTarget * 2)
    return `Prime cost is elevated at ${fmtPct(data.primeCostPct)} — labor is fixed while revenue ramps. Food and beverage spend are within controllable range.`
  if (data.primeCostPct > data.primeCostTarget)
    return `Prime cost is above target at ${fmtPct(data.primeCostPct)}. Monitor food spend as revenue builds.`
  return `Prime cost is healthy at ${fmtPct(data.primeCostPct)}, within your ${fmtPct(data.primeCostTarget)} target.`
}

const navBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: '18px', padding: '2px 4px', lineHeight: 1 }

export default Home
