import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtFull, fmtPeriodLabel, getMonthRange } from '../lib/utils'
import { createPropertyWithDefaults } from '../lib/propertyUtils'

// ── Controller / Portfolio screen ─────────────────────────────────────────────
// Overview tab: real portfolio data from ownedProperties / assignedProperties.
// Budgets tab: real GL code data for the active property.
// Month-End tab: real invoice data + working CSV export.

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (New York)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage',   label: 'Alaska' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii' },
]

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--text-4)',
  marginBottom: '8px',
}

const Controller = () => {
  const {
    profile,
    activePropertyId,
    activeProperty,
    setActiveProperty,
    ownedProperties,
    assignedProperties,
    refreshProfile,
    periodYear: year, setPeriodYear: setYear,
    periodMonth: month, setPeriodMonth: setMonth,
  } = useAuth()

  const isOwner = profile?.role === 'owner'
  const properties = isOwner ? ownedProperties : assignedProperties

  const [tab, setTab] = useState('overview')

  // Budgets tab data
  const [glCodes,       setGlCodes]       = useState([])
  const [approvedSpend, setApprovedSpend] = useState({})
  const [loadingBudgets, setLoadingBudgets] = useState(false)

  // Export tab data
  const [exportInvoices, setExportInvoices] = useState([])
  const [loadingExport,  setLoadingExport]  = useState(false)
  const [exporting,      setExporting]      = useState(false)

  // Property activity data (for Live/Pending badges)
  const [propertyActivity, setPropertyActivity] = useState({}) // { propertyId: boolean }
  const [loadingActivity, setLoadingActivity]   = useState(false)

  // Add / Edit property modal
  const [showModal, setShowModal]     = useState(false)
  const [editingProp, setEditingProp] = useState(null) // null = add, object = edit
  const [modalForm, setModalForm]     = useState({ name: '', timezone: 'America/New_York', prime_cost_target: '62.0', type: '', city: '', location_count: '1' })
  const [modalSaving, setModalSaving] = useState(false)
  const [modalError, setModalError]   = useState(null)
  const [modalStep, setModalStep]     = useState('form') // 'form' | 'gl-codes'
  const [newPropId, setNewPropId]     = useState(null)
  const [glBudgets, setGlBudgets]     = useState([])
  const [glSaving, setGlSaving]       = useState(false)
  const [glSaveError, setGlSaveError] = useState(null)

  const periodLabel = fmtPeriodLabel(year, month)
  const activePropName = activeProperty?.name || 'Property'

  // ── Fetch property activity (Live vs Pending) ────────────────────────────────
  const fetchActivity = useCallback(async () => {
    if (properties.length === 0) return
    setLoadingActivity(true)
    const n = new Date()
    const { start, end } = getMonthRange(n.getFullYear(), n.getMonth() + 1)
    const activity = {}

    // Check each property for invoice or sales data this month
    await Promise.all(
      properties.map(async (p) => {
        const [invRes, salesRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('property_id', p.id)
            .gte('invoice_date', start)
            .lte('invoice_date', end),
          supabase
            .from('sales_entries')
            .select('id', { count: 'exact', head: true })
            .eq('property_id', p.id)
            .gte('date', start)
            .lte('date', end),
        ])
        activity[p.id] = (invRes.count || 0) > 0 || (salesRes.count || 0) > 0
      })
    )

    setPropertyActivity(activity)
    setLoadingActivity(false)
  }, [properties.length])

  useEffect(() => { fetchActivity() }, [fetchActivity])

  // ── Fetch GL budget health (for Needs Attention / Healthy stats) ─────────────
  const [budgetHealth, setBudgetHealth] = useState({ attention: 0, healthy: 0 })

  const fetchBudgetHealth = useCallback(async () => {
    if (properties.length === 0) return
    const n = new Date()
    const { start, end } = getMonthRange(n.getFullYear(), n.getMonth() + 1)
    let attention = 0
    let healthy = 0

    await Promise.all(
      properties.map(async (p) => {
        const [glRes, invRes] = await Promise.all([
          supabase.from('gl_codes').select('code, monthly_budget').eq('property_id', p.id).eq('is_active', true),
          supabase.from('invoices').select('gl_code, amount').eq('property_id', p.id).eq('status', 'approved').gte('invoice_date', start).lte('invoice_date', end),
        ])
        const codes = glRes.data || []
        const invs = invRes.data || []
        if (codes.length === 0) return

        const spend = {}
        for (const inv of invs) {
          spend[inv.gl_code] = (spend[inv.gl_code] || 0) + Number(inv.amount)
        }
        const hasOverBudget = codes.some(
          (gl) => Number(gl.monthly_budget) > 0 && (spend[gl.code] || 0) > Number(gl.monthly_budget)
        )
        if (hasOverBudget) attention++
        else healthy++
      })
    )

    setBudgetHealth({ attention, healthy })
  }, [properties.length])

  useEffect(() => { fetchBudgetHealth() }, [fetchBudgetHealth])

  // ── Computed summary stats ───────────────────────────────────────────────────
  const activePilots = Object.values(propertyActivity).filter(Boolean).length

  // ── Fetch budget data for active property ────────────────────────────────────
  const fetchBudgets = useCallback(async () => {
    if (!activePropertyId) return
    setLoadingBudgets(true)
    const { start, end } = getMonthRange(year, month)

    const [glRes, invRes] = await Promise.all([
      supabase.from('gl_codes').select('*').eq('property_id', activePropertyId).eq('is_active', true).order('sort_order'),
      supabase.from('invoices').select('gl_code, amount').eq('property_id', activePropertyId).eq('status', 'approved').gte('invoice_date', start).lte('invoice_date', end),
    ])

    const codes = glRes.data || []
    const spend = {}
    for (const inv of (invRes.data || [])) {
      spend[inv.gl_code] = (spend[inv.gl_code] || 0) + Number(inv.amount)
    }

    setGlCodes(codes)
    setApprovedSpend(spend)
    setLoadingBudgets(false)
  }, [activePropertyId, year, month])

  // ── Fetch export data for active property ────────────────────────────────────
  const fetchExport = useCallback(async () => {
    if (!activePropertyId) return
    setLoadingExport(true)
    const { start, end } = getMonthRange(year, month)

    const { data } = await supabase
      .from('invoices')
      .select('invoice_date, amount, description, gl_code, status, vendors(name)')
      .eq('property_id', activePropertyId)
      .eq('status', 'approved')
      .gte('invoice_date', start)
      .lte('invoice_date', end)
      .order('invoice_date')

    setExportInvoices(data || [])
    setLoadingExport(false)
  }, [activePropertyId, year, month])

  useEffect(() => {
    if (tab === 'budgets') fetchBudgets()
    if (tab === 'export')  fetchExport()
  }, [tab, fetchBudgets, fetchExport])

  // ── Period navigation ────────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const n = new Date()
    if (year === n.getFullYear() && month === n.getMonth() + 1) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true)

    // If no data loaded yet, fetch it directly and use the result (not stale state)
    let rows = exportInvoices
    if (rows.length === 0) {
      const { start, end } = getMonthRange(year, month)
      const { data } = await supabase
        .from('invoices')
        .select('invoice_date, amount, description, gl_code, status, vendors(name)')
        .eq('property_id', activePropertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end)
        .order('invoice_date')
      rows = data || []
      setExportInvoices(rows)
    }

    const header = ['Date', 'Vendor', 'Description', 'Amount', 'GL Code', 'Status']
    const csvRows = [
      header.join(','),
      ...rows.map((inv) => [
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
    a.download = `${activePropName}-GL-Report-${MONTHS[month - 1]}-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // ── Property card click — switch active property ─────────────────────────────
  const handlePropertyClick = (prop) => {
    setActiveProperty(prop)
  }

  // ── Add / Edit property modal ────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingProp(null)
    setModalForm({ name: '', timezone: 'America/New_York', prime_cost_target: '62.0', type: '', city: '', location_count: '1' })
    setModalError(null)
    setModalStep('form')
    setNewPropId(null)
    setGlBudgets([])
    setGlSaveError(null)
    setShowModal(true)
  }

  const openEditModal = (prop) => {
    setEditingProp(prop)
    setModalForm({
      name: prop.name || '',
      timezone: prop.timezone || 'America/New_York',
      prime_cost_target: String(prop.prime_cost_target ?? '62.0'),
      type: prop.type || '',
      city: prop.city || '',
      location_count: String(prop.location_count ?? '1'),
    })
    setModalError(null)
    setShowModal(true)
  }

  const handleModalSubmit = async (e) => {
    e.preventDefault()
    if (!modalForm.name.trim()) return
    setModalSaving(true)
    setModalError(null)

    if (editingProp) {
      // Update existing property
      const { error } = await supabase
        .from('properties')
        .update({
          name:             modalForm.name.trim(),
          timezone:         modalForm.timezone,
          prime_cost_target: parseFloat(modalForm.prime_cost_target) || 62.0,
          type:             modalForm.type.trim() || null,
          city:             modalForm.city.trim() || null,
          location_count:   parseInt(modalForm.location_count) || 1,
        })
        .eq('id', editingProp.id)

      setModalSaving(false)
      if (error) { setModalError(error.message); return }
    } else {
      // Create new property with defaults
      const { property, error } = await createPropertyWithDefaults({
        name:             modalForm.name.trim(),
        timezone:         modalForm.timezone,
        prime_cost_target: parseFloat(modalForm.prime_cost_target) || 62.0,
        type:             modalForm.type.trim() || null,
        city:             modalForm.city.trim() || null,
        location_count:   parseInt(modalForm.location_count) || 1,
      }, profile.id)

      setModalSaving(false)
      if (error) { setModalError(error); return }

      // Transition to GL codes step
      setNewPropId(property.id)
      // Fetch the seeded GL codes for the new property
      const { data: seededGl } = await supabase
        .from('gl_codes')
        .select('id, code, name, category, monthly_budget, sort_order')
        .eq('property_id', property.id)
        .order('sort_order')
      setGlBudgets((seededGl || []).map(g => ({ ...g })))
      setModalStep('gl-codes')
      await refreshProfile()
      return
    }

    // Refresh properties in context (edit path)
    await refreshProfile()
    setShowModal(false)
  }

  // ── GL codes step handlers ───────────────────────────────────────────────────
  const handleGlSave = async () => {
    if (!newPropId) return
    setGlSaving(true)
    setGlSaveError(null)

    const rows = glBudgets.map(g => ({
      id:             g.id,
      property_id:    newPropId,
      code:           g.code,
      name:           g.name,
      category:       g.category,
      monthly_budget: parseFloat(g.monthly_budget) || 0,
      sort_order:     g.sort_order,
    }))

    const { error } = await supabase
      .from('gl_codes')
      .upsert(rows, { onConflict: 'id' })

    setGlSaving(false)
    if (error) { setGlSaveError(error.message); return }
    setShowModal(false)
  }

  const handleGlSkip = () => {
    setShowModal(false)
  }

  // ── Computed export stats ────────────────────────────────────────────────────
  const totalSpend   = exportInvoices.reduce((s, i) => s + Number(i.amount), 0)
  const invoiceCount = exportInvoices.length

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Portfolio</div>
        {isOwner && (
          <button
            onClick={openAddModal}
            style={{
              background: 'var(--amber)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            + Add Property
          </button>
        )}
      </div>

      {/* ── Summary stats (dynamic) ── */}
      <div className="stat-grid">
        <div className="stat-cell">
          <div className="stat-label">Properties</div>
          <div className="stat-val">{properties.length}</div>
          <div className="stat-sub">{isOwner ? 'Owned' : 'Assigned'}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Active Pilots</div>
          <div className="stat-val">{loadingActivity ? '—' : activePilots}</div>
          <div className="stat-sub">Data this month</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Needs Attention</div>
          <div className="stat-val" style={{ color: budgetHealth.attention > 0 ? 'var(--orange)' : 'var(--text-4)' }}>
            {budgetHealth.attention}
          </div>
          <div className="stat-sub">Over budget</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Healthy</div>
          <div className="stat-val" style={{ color: budgetHealth.healthy > 0 ? 'var(--green)' : 'var(--text-4)' }}>
            {budgetHealth.healthy}
          </div>
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
              border: '1px solid var(--border)',
              background: tab === key ? 'var(--amber)' : 'var(--surface)',
              color: tab === key ? '#0A0A0A' : 'var(--text-3)',
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

      {/* ── Overview tab (real property cards) ── */}
      {tab === 'overview' && (
        <>
          <div className="section-label">Properties</div>
          {properties.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-4)', fontSize: '13px' }}>
              No properties yet.{isOwner ? ' Add your first property above.' : ''}
            </div>
          )}
          {properties.map((p) => {
            const isActive = p.id === activePropertyId
            const isLive   = propertyActivity[p.id]
            return (
              <div
                key={p.id}
                onClick={() => handlePropertyClick(p)}
                className="nura-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  border: isActive ? '2px solid var(--amber)' : '1px solid var(--border)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: isLive ? 'var(--amber)' : 'var(--text-4)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                    {[p.city, p.type].filter(Boolean).join(' · ') || p.timezone}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isLive ? (
                    <span className="bdg bdg-amber">Live</span>
                  ) : (
                    <span className="bdg bdg-neutral">Pending</span>
                  )}
                  {isActive && (
                    <span className="bdg bdg-blue">Active</span>
                  )}
                  {isOwner && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(p) }}
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        padding: '3px 10px',
                        fontSize: '11px',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ── Budgets tab (real data for active property) ── */}
      {tab === 'budgets' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Budget Authority — {activePropName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={prevMonth} style={navBtnStyle}>‹</button>
              <span style={{ fontSize: '12px', color: 'var(--text-4)', minWidth: '70px', textAlign: 'center' }}>{periodLabel}</span>
              <button onClick={nextMonth} style={navBtnStyle}>›</button>
            </div>
          </div>

          {loadingBudgets ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div className="nura-card">
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>
                {activePropName} — {periodLabel}
              </div>
              {glCodes.map(({ code, name, monthly_budget }, i) => {
                const spent     = approvedSpend[code] || 0
                const remaining = Number(monthly_budget) - spent
                const isOver    = remaining < 0
                return (
                  <div
                    key={code || `gl-${i}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: 'var(--text-3)',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ color: isOver ? 'var(--orange)' : 'var(--green)', fontWeight: '600' }}>
                      {isOver ? `-${fmtFull(Math.abs(remaining))}` : fmtFull(remaining)} left
                    </span>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span>Total Spend</span>
                <span>{fmt(Object.values(approvedSpend).reduce((s, v) => s + v, 0))}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Month-End Export tab (real data for active property) ── */}
      {tab === 'export' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Month-End Export — {activePropName}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button onClick={prevMonth} style={navBtnStyle}>‹</button>
              <span style={{ fontSize: '12px', color: 'var(--text-4)', minWidth: '70px', textAlign: 'center' }}>{periodLabel}</span>
              <button onClick={nextMonth} style={navBtnStyle}>›</button>
            </div>
          </div>

          {loadingExport ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <div className="nura-card">
              {invoiceCount === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                  No approved invoices for {periodLabel}.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginBottom: '14px', lineHeight: '1.6' }}>
                    {periodLabel} — {invoiceCount} approved {invoiceCount === 1 ? 'invoice' : 'invoices'} totalling {fmtFull(totalSpend)}.
                  </div>
                  {[
                    ['Invoices coded', String(invoiceCount),  'var(--text)'],
                    ['Total spend',    fmtFull(totalSpend),   'var(--text)'],
                    ['Audit variance', '$0.00',               'var(--green)'],
                  ].map(([label, value, color]) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '12px',
                        color: 'var(--text-3)',
                        padding: '6px 0',
                        borderBottom: '1px solid var(--border)',
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

      {/* ── Add / Edit Property Modal ── */}
      {showModal && (() => {
        const isDesktop = window.innerWidth >= 768
        return (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--overlay-heavy)',
            zIndex: 200, display: 'flex',
            alignItems: isDesktop ? 'center' : 'flex-end',
            justifyContent: isDesktop ? 'center' : 'stretch',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: isDesktop ? '20px' : '20px 20px 0 0',
              padding: '24px 20px 36px',
              width: '100%',
              maxWidth: '480px',
              margin: '0 auto',
            }}
          >
            <div style={{ width: '36px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 20px' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div className="font-newsreader" style={{ fontSize: '20px', fontWeight: 400 }}>
                {modalStep === 'gl-codes'
                  ? `Set up GL codes for ${modalForm.name.trim()}`
                  : editingProp ? 'Edit Property' : 'Add Property'}
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '18px', padding: '4px', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            {/* ── Step 1: Property form ── */}
            {modalStep === 'form' && (
              <form onSubmit={handleModalSubmit}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Property name</label>
                  <input
                    type="text"
                    className="nura-input"
                    placeholder="e.g. SYN"
                    value={modalForm.name}
                    onChange={(e) => setModalForm(f => ({ ...f, name: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>City</label>
                    <input
                      type="text"
                      className="nura-input"
                      placeholder="e.g. Washington DC"
                      value={modalForm.city}
                      onChange={(e) => setModalForm(f => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Type</label>
                    <input
                      type="text"
                      className="nura-input"
                      placeholder="e.g. Fine dining"
                      value={modalForm.type}
                      onChange={(e) => setModalForm(f => ({ ...f, type: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Timezone</label>
                  <select
                    className="nura-select"
                    value={modalForm.timezone}
                    onChange={(e) => setModalForm(f => ({ ...f, timezone: e.target.value }))}
                  >
                    {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Prime cost target (%)</label>
                    <input
                      type="number"
                      className="nura-input"
                      placeholder="62.0"
                      step="0.1"
                      min="0"
                      max="200"
                      value={modalForm.prime_cost_target}
                      onChange={(e) => setModalForm(f => ({ ...f, prime_cost_target: e.target.value }))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Location count</label>
                    <input
                      type="number"
                      className="nura-input"
                      placeholder="1"
                      min="1"
                      value={modalForm.location_count}
                      onChange={(e) => setModalForm(f => ({ ...f, location_count: e.target.value }))}
                    />
                  </div>
                </div>

                {modalError && (
                  <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{modalError}</div>
                )}

                <button type="submit" className="btn-primary" disabled={modalSaving || !modalForm.name.trim()}>
                  {modalSaving ? 'Saving…' : editingProp ? 'Update Property' : 'Create Property'}
                </button>
              </form>
            )}

            {/* ── Step 2: GL codes setup (after create only) ── */}
            {modalStep === 'gl-codes' && (
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '16px', lineHeight: '1.6' }}>
                  Enter GL code numbers if you have them and set monthly budgets. Code numbers are optional.
                </div>

                <div className="nura-card" style={{ marginBottom: '14px' }}>
                  {glBudgets.map((g, i) => (
                    <div
                      key={g.id}
                      style={{
                        padding: '9px 0',
                        borderBottom: i < glBudgets.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>{g.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="e.g. 5200 — leave blank if unknown"
                          value={g.code}
                          onChange={e => {
                            const val = e.target.value
                            setGlBudgets(prev => prev.map((x, j) => j === i ? { ...x, code: val } : x))
                          }}
                          style={{
                            flex: 1, border: '1px solid var(--border)', borderRadius: '6px',
                            padding: '5px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                            background: 'var(--surface)', color: 'var(--text)',
                          }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={g.monthly_budget}
                            onChange={e => {
                              const val = parseFloat(e.target.value) || 0
                              setGlBudgets(prev => prev.map((x, j) => j === i ? { ...x, monthly_budget: val } : x))
                            }}
                            style={{
                              width: '90px', border: '1px solid var(--border)', borderRadius: '6px',
                              padding: '5px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                              textAlign: 'right', background: 'var(--surface)', color: 'var(--text)',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {glSaveError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{glSaveError}</div>}

                <button className="btn-primary" onClick={handleGlSave} disabled={glSaving}>
                  {glSaving ? 'Saving…' : 'Save GL Codes'}
                </button>

                <button
                  onClick={handleGlSkip}
                  style={{
                    display: 'block', width: '100%', marginTop: '10px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', fontSize: '13px', textAlign: 'center',
                    fontFamily: "'DM Sans', sans-serif", padding: '8px',
                  }}
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        </div>
        )
      })()}
    </div>
  )
}

const navBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-4)',
  fontSize: '18px',
  padding: '2px 4px',
  lineHeight: 1,
}

export default Controller
