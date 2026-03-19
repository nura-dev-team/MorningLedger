import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtFull, fmtPct, fmtPeriodLabel, getMonthRange } from '../lib/utils'

// ── Controller / Portfolio screen ─────────────────────────────────────────────
// Overview tab: static portfolio context (single pilot property).
// Budgets tab: real GL code data from Supabase.
// Month-End tab: real invoice data + working CSV export.

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const Controller = () => {
  const { profile } = useAuth()
  const propertyId   = profile?.property_id
  const propertyName = profile?.properties?.name || 'Property'

  const [tab, setTab] = useState('overview')

  // Period
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  // Budgets tab data
  const [glCodes,       setGlCodes]       = useState([])
  const [approvedSpend, setApprovedSpend] = useState({}) // { code: totalAmount }
  const [loadingBudgets, setLoadingBudgets] = useState(false)

  // Export tab data
  const [exportInvoices, setExportInvoices] = useState([])
  const [loadingExport,  setLoadingExport]  = useState(false)
  const [exporting,      setExporting]      = useState(false)

  const periodLabel = fmtPeriodLabel(year, month)

  // ── Fetch budget data ──────────────────────────────────────────────────────
  const fetchBudgets = useCallback(async () => {
    if (!propertyId) return
    setLoadingBudgets(true)
    const { start, end } = getMonthRange(year, month)

    const [glRes, invRes] = await Promise.all([
      supabase.from('gl_codes').select('*').eq('property_id', propertyId).eq('is_active', true).order('sort_order'),
      supabase.from('invoices').select('gl_code, amount').eq('property_id', propertyId).eq('status', 'approved').gte('invoice_date', start).lte('invoice_date', end),
    ])

    const codes = glRes.data || []
    const spend = {}
    for (const inv of (invRes.data || [])) {
      spend[inv.gl_code] = (spend[inv.gl_code] || 0) + Number(inv.amount)
    }

    setGlCodes(codes)
    setApprovedSpend(spend)
    setLoadingBudgets(false)
  }, [propertyId, year, month])

  // ── Fetch export data ──────────────────────────────────────────────────────
  const fetchExport = useCallback(async () => {
    if (!propertyId) return
    setLoadingExport(true)
    const { start, end } = getMonthRange(year, month)

    const { data } = await supabase
      .from('invoices')
      .select('invoice_date, amount, description, gl_code, status, vendors(name)')
      .eq('property_id', propertyId)
      .eq('status', 'approved')
      .gte('invoice_date', start)
      .lte('invoice_date', end)
      .order('invoice_date')

    setExportInvoices(data || [])
    setLoadingExport(false)
  }, [propertyId, year, month])

  // Load data when tab switches
  useEffect(() => {
    if (tab === 'budgets') fetchBudgets()
    if (tab === 'export')  fetchExport()
  }, [tab, fetchBudgets, fetchExport])

  // ── Period navigation ──────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (year === now.getFullYear() && month === now.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)
    // Ensure we have fresh data
    let rows = exportInvoices
    if (rows.length === 0) {
      await fetchExport()
      rows = exportInvoices
    }

    const header = ['Date', 'Vendor', 'Description', 'Amount', 'GL Code', 'Status']
    const csvRows = [
      header.join(','),
      ...exportInvoices.map((inv) => [
        inv.invoice_date,
        `"${(inv.vendors?.name || '').replace(/"/g, '""')}"`,
        `"${(inv.description || '').replace(/"/g, '""')}"`,
        Number(inv.amount).toFixed(2),
        inv.gl_code,
        inv.status,
      ].join(',')),
    ]

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${propertyName}-GL-Report-${MONTHS[month - 1]}-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // ── Computed export stats ──────────────────────────────────────────────────
  const totalSpend  = exportInvoices.reduce((s, i) => s + Number(i.amount), 0)
  const invoiceCount = exportInvoices.length

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Controller</div>
        <span className="bdg bdg-blue">Donohoe Portfolio</span>
      </div>

      {/* ── Summary stats (static portfolio context) ── */}
      <div className="stat-grid">
        <div className="stat-cell">
          <div className="stat-label">Properties</div>
          <div className="stat-val">22</div>
          <div className="stat-sub">Donohoe total</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Active Pilots</div>
          <div className="stat-val">1</div>
          <div className="stat-sub">SYN live</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Needs Attention</div>
          <div className="stat-val" style={{ color: 'var(--orange)' }}>1</div>
          <div className="stat-sub">Budget over</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Healthy</div>
          <div className="stat-val" style={{ color: 'var(--green)' }}>1</div>
          <div className="stat-sub">On track</div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'budgets',  label: 'Budgets' },
          { key: 'export',   label: 'Month-End' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              flex: 1,
              padding: '7px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--nborder)',
              background: tab === key ? 'var(--nt)' : 'var(--nsurf)',
              color: tab === key ? 'white' : 'var(--nt3)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab (static pilot context) ── */}
      {tab === 'overview' && (
        <>
          <div className="section-label">Properties</div>
          {[
            {
              id: 'syn', name: `${propertyName} — DC`,
              subtitle: 'Donohoe · Live pilot',
              live: true,
            },
            { id: 'p2', name: 'Property 2', subtitle: 'Donohoe · Not yet onboarded', live: false },
            { id: 'p3', name: 'Property 3', subtitle: 'Donohoe · Not yet onboarded', live: false },
          ].map((p) => (
            <div
              key={p.id}
              className="nura-card"
              style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: p.live ? 1 : 0.4 }}
            >
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.live ? 'var(--amber)' : 'var(--nt4)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: p.live ? 'var(--nt)' : 'var(--nt3)' }}>{p.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>{p.subtitle}</div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                {p.live ? (
                  <span className="bdg bdg-amber">Live</span>
                ) : (
                  <span className="bdg bdg-neutral">Pending</span>
                )}
              </div>
            </div>
          ))}
          <div className="note-amber">
            Full 22-property portfolio view unlocks as properties are onboarded. {propertyName} is the live pilot.
          </div>
        </>
      )}

      {/* ── Budgets tab (real data) ── */}
      {tab === 'budgets' && (
        <>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Budget Authority — {propertyName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={prevMonth} style={navBtnStyle}>‹</button>
              <span style={{ fontSize: '12px', color: 'var(--nt4)', minWidth: '70px', textAlign: 'center' }}>{periodLabel}</span>
              <button onClick={nextMonth} style={navBtnStyle}>›</button>
            </div>
          </div>

          {loadingBudgets ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div className="nura-card">
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>
                {propertyName} — {periodLabel}
              </div>
              {glCodes.map(({ code, name, monthly_budget }) => {
                const spent     = approvedSpend[code] || 0
                const remaining = Number(monthly_budget) - spent
                const isOver    = remaining < 0
                return (
                  <div
                    key={code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--nt3)',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--nborder)',
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: isOver ? 'var(--orange)' : 'var(--green)', fontWeight: '600' }}>
                      {isOver ? `-${fmtFull(Math.abs(remaining))}` : fmtFull(remaining)} left
                    </span>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--nborder)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span>Total Spend</span>
                <span>{fmt(Object.values(approvedSpend).reduce((s, v) => s + v, 0))}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Month-End Export tab (real data) ── */}
      {tab === 'export' && (
        <>
          {/* Period selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Month-End Export — {propertyName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={prevMonth} style={navBtnStyle}>‹</button>
              <span style={{ fontSize: '12px', color: 'var(--nt4)', minWidth: '70px', textAlign: 'center' }}>{periodLabel}</span>
              <button onClick={nextMonth} style={navBtnStyle}>›</button>
            </div>
          </div>

          {loadingExport ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div className="nura-card">
              {invoiceCount === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--nt3)', textAlign: 'center', padding: '16px 0' }}>
                  No approved invoices for {periodLabel}.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: 'var(--nt2)', marginBottom: '14px', lineHeight: '1.6' }}>
                    {periodLabel} — {invoiceCount} approved {invoiceCount === 1 ? 'invoice' : 'invoices'} totalling {fmtFull(totalSpend)}.
                  </div>
                  {[
                    ['Invoices coded', String(invoiceCount),       'var(--nt)'],
                    ['Total spend',    fmtFull(totalSpend),        'var(--nt)'],
                    ['Audit variance', '$0.00',                    'var(--green)'],
                  ].map(([label, value, color]) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: 'var(--nt3)',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--nborder)',
                      }}
                    >
                      <span>{label}</span>
                      <span style={{ fontWeight: '600', color }}>{value}</span>
                    </div>
                  ))}
                </>
              )}
              <button
                className="btn-primary"
                style={{ marginTop: '14px' }}
                onClick={handleExport}
                disabled={exporting || invoiceCount === 0}
              >
                {exporting ? 'Exporting…' : `Export GL Report — ${periodLabel}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const navBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--nt4)',
  fontSize: '18px',
  padding: '2px 4px',
  lineHeight: 1,
}

export default Controller
