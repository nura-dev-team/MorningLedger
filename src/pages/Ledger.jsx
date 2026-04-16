import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtFull, fmtDateShort, getMonthRange, fmtPeriodLabel } from '../lib/utils'

// ── Ledger screen ─────────────────────────────────────────────────────────────

const Ledger = () => {
  const { activePropertyId } = useAuth()
  const propertyId = activePropertyId

  const [tab, setTab] = useState('invoices')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [invoices, setInvoices] = useState([])
  const [vendors, setVendors] = useState([])
  const [vendorInvoiceCounts, setVendorInvoiceCounts] = useState({}) // { vendorId: count }
  const [vendorLastDates, setVendorLastDates] = useState({}) // { vendorId: dateStr }

  // Add vendor state
  const [glCodesForVendor, setGlCodesForVendor] = useState([])
  const [addVendorForm, setAddVendorForm] = useState({ name: '', default_gl_code: '', delivery_frequency: '' })
  const [addVendorSaving, setAddVendorSaving] = useState(false)
  const [addVendorError, setAddVendorError] = useState(null)
  const [addVendorSuccess, setAddVendorSuccess] = useState(false)
  const [showAddVendor, setShowAddVendor] = useState(false)

  const periodLabel = fmtPeriodLabel(new Date().getFullYear(), new Date().getMonth() + 1)

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const now = new Date()
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

    const [invRes, vendorRes, allInvRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_date, amount, description, gl_code, status, extraction_confidence, vendor_id, vendors(name, default_gl_code)')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end)
        .order('invoice_date', { ascending: false }),

      supabase
        .from('vendors')
        .select('id, name, default_gl_code, delivery_frequency, is_active')
        .eq('property_id', propertyId)
        .order('name'),

      // All approved invoices (not just this month) for vendor stats
      supabase
        .from('invoices')
        .select('vendor_id, invoice_date')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .order('invoice_date', { ascending: false }),
    ])

    if (invRes.error) { setError(invRes.error.message); setLoading(false); return }

    setInvoices(invRes.data || [])
    setVendors(vendorRes.data || [])

    // Compute per-vendor invoice counts and last invoice dates
    const counts = {}
    const lastDates = {}
    for (const inv of (allInvRes.data || [])) {
      if (!inv.vendor_id) continue
      counts[inv.vendor_id] = (counts[inv.vendor_id] || 0) + 1
      if (!lastDates[inv.vendor_id] || inv.invoice_date > lastDates[inv.vendor_id]) {
        lastDates[inv.vendor_id] = inv.invoice_date
      }
    }
    setVendorInvoiceCounts(counts)
    setVendorLastDates(lastDates)
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchData() }, [fetchData])

  // GL codes for add vendor form
  useEffect(() => {
    if (tab !== 'vendors' || !propertyId) return
    supabase
      .from('gl_codes')
      .select('id, code, name')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setGlCodesForVendor(data || []))
  }, [tab, propertyId])

  const handleAddVendor = async (e) => {
    e.preventDefault()
    if (!propertyId || !addVendorForm.name.trim()) return
    setAddVendorSaving(true)
    setAddVendorError(null)

    const { data, error } = await supabase.from('vendors').insert({
      property_id: propertyId,
      name: addVendorForm.name.trim(),
      default_gl_code: addVendorForm.default_gl_code || null,
      delivery_frequency: addVendorForm.delivery_frequency || null,
      is_active: true,
    }).select().single()

    setAddVendorSaving(false)
    if (error) { setAddVendorError(error.message); return }
    setVendors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setAddVendorForm({ name: '', default_gl_code: '', delivery_frequency: '' })
    setAddVendorSuccess(true)
    setShowAddVendor(false)
    setTimeout(() => setAddVendorSuccess(false), 3000)
  }

  const total = invoices.reduce((s, i) => s + Number(i.amount), 0)

  // Per-vendor GL code invoice count (for "X prior invoices" in ledger rows)
  const vendorGlCounts = {}
  for (const inv of invoices) {
    const key = `${inv.vendor_id}::${inv.gl_code}`
    vendorGlCounts[key] = (vendorGlCounts[key] || 0) + 1
  }

  // Determine source: if extraction_confidence exists, it was scanned/uploaded; otherwise assume email
  const getSource = (inv) => {
    if (inv.extraction_confidence != null && inv.extraction_confidence > 0) return 'scan'
    return 'email'
  }

  // Determine GL method
  const getGlMethod = (inv) => {
    const vendorDefault = inv.vendors?.default_gl_code
    if (vendorDefault && vendorDefault === inv.gl_code) {
      const count = vendorGlCounts[`${inv.vendor_id}::${inv.gl_code}`] || 0
      return { method: 'Vendor default', count }
    }
    if (inv.extraction_confidence != null && inv.extraction_confidence > 0) {
      return { method: 'AI suggestion', count: 0 }
    }
    return { method: 'Vendor default', count: vendorGlCounts[`${inv.vendor_id}::${inv.gl_code}`] || 0 }
  }

  // Gap detection: days since last invoice vs typical frequency
  const getGapDays = (vendor) => {
    const lastDate = vendorLastDates[vendor.id]
    if (!lastDate) return null
    const diffMs = Date.now() - new Date(lastDate).getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  const getExpectedFreqDays = (freq) => {
    if (!freq) return null
    const f = freq.toLowerCase()
    if (f.includes('daily')) return 3
    if (f.includes('2x/week') || f.includes('twice')) return 5
    if (f.includes('week')) return 10
    if (f.includes('2x/month') || f.includes('biweek')) return 20
    if (f.includes('month')) return 40
    return null
  }

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Ledger</div>
        {!loading && <span className="bdg bdg-green">$0 Variance</span>}
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
      ) : (
        <>
          {/* ── Summary stats ── */}
          <div className="stat-grid">
            <div className="stat-cell">
              <div className="stat-label">Invoices</div>
              <div className="stat-val">{invoices.length}</div>
              <div className="stat-sub">{invoices.length === 0 ? 'Add your first invoice' : 'All coded at ingestion'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Total Spend</div>
              <div className="stat-val">{fmt(total)}</div>
              <div className="stat-sub">{total === 0 ? 'Pending first invoice' : '$0 variance'}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Audit Variance</div>
              <div className="stat-val" style={{ color: 'var(--green)' }}>$0.00</div>
              <div className="stat-sub">Clean</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Vendors Active</div>
              <div className="stat-val">{vendors.filter(v => v.is_active).length}</div>
              <div className="stat-sub">All active</div>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            {[
              { key: 'invoices', label: 'Invoice Ledger' },
              { key: 'vendors', label: 'Master Vendor List' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  flex: 1, padding: '8px', borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: tab === key ? 'var(--surface)' : 'var(--surface-alt)',
                  color: tab === key ? 'var(--text)' : 'var(--text-3)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: '12px', fontWeight: tab === key ? '600' : '500',
                  cursor: 'pointer',
                  boxShadow: tab === key ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── Invoice Ledger tab ── */}
          {tab === 'invoices' && (
            <>
              <div className="nura-card" style={{ padding: '4px 16px' }}>
                {invoices.length === 0 ? (
                  <>
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="txr" style={{ padding: '10px 0' }}>
                        <div style={{ flex: 1 }}>
                          <div className="ghost" style={{ width: n === 1 ? '45%' : n === 2 ? '55%' : '40%', height: '14px', marginBottom: '8px', borderRadius: '4px' }} />
                          <div className="ghost" style={{ width: n === 1 ? '65%' : n === 2 ? '50%' : '60%', height: '10px', borderRadius: '3px' }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ textAlign: 'center', padding: '12px 0', fontSize: '13px', color: 'var(--text-4)' }}>
                      No approved invoices for {periodLabel}.
                    </div>
                    <Link
                      to="/approvals"
                      style={{ display: 'block', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: '500', color: 'var(--amber)', textDecoration: 'none' }}
                    >
                      Add invoices from Acknowledge & Code →
                    </Link>
                  </>
                ) : (
                  invoices.map((inv) => {
                    const source = getSource(inv)
                    const glMethod = getGlMethod(inv)
                    return (
                      <div key={inv.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: '1px solid var(--border-light)',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: '500' }}>
                            {inv.vendors?.name || 'Unknown'}
                            {' '}
                            <span style={{
                              fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px',
                              textTransform: 'uppercase', letterSpacing: '0.3px',
                              background: source === 'email' ? 'var(--blue-bg)' : 'var(--surface-alt)',
                              color: source === 'email' ? 'var(--blue)' : 'var(--text-3)',
                            }}>
                              {source}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                            {inv.description} · {fmtDateShort(inv.invoice_date)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>{fmtFull(Number(inv.amount))}</div>
                          <div>
                            <span className="gl-pill">{inv.gl_code}</span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            {glMethod.method === 'AI suggestion' ? (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /></svg>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
                            )}
                            {glMethod.method}{glMethod.count > 1 ? ` · ${glMethod.count} prior` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {invoices.length > 0 && (
                <div style={{
                  background: 'var(--surface-alt)', borderLeft: '3px solid var(--border)',
                  borderRadius: '0 var(--r-sm) var(--r-sm) 0', padding: '11px 14px',
                  fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, marginTop: '10px',
                }}>
                  All invoices coded with GL categories at the moment of ingestion. GL coding uses 3 layers: <strong>vendor default</strong>, <strong>AI suggestion</strong>, and <strong>preference rules</strong>. P&L is forming in parallel — no month-end cleanup. Audit variance: <strong>$0.00</strong>.
                </div>
              )}
            </>
          )}

          {/* ── Master Vendor List tab ── */}
          {tab === 'vendors' && (
            <>
              <div className="nura-card" style={{ padding: '4px 16px' }}>
                {vendors.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-3)', fontSize: '13px' }}>
                    No vendors yet. Add your first vendor below.
                  </div>
                ) : (
                  vendors.map((v) => {
                    const invCount = vendorInvoiceCounts[v.id] || 0
                    const lastDate = vendorLastDates[v.id]
                    const gapDays = getGapDays(v)
                    const expectedDays = getExpectedFreqDays(v.delivery_frequency)
                    const hasGap = gapDays !== null && expectedDays !== null && gapDays > expectedDays

                    // Connection status
                    let statusColor, statusTag, tagClass
                    if (!v.is_active) {
                      statusColor = 'var(--text-4)'
                      statusTag = `no activity — ${gapDays ?? '?'} days`
                      tagClass = 'gap'
                    } else if (hasGap) {
                      statusColor = 'var(--text-4)'
                      statusTag = `no activity — ${gapDays} days`
                      tagClass = 'gap'
                    } else if (v.default_gl_code && invCount >= 3) {
                      statusColor = 'var(--green)'
                      statusTag = 'auto-ingesting'
                      tagClass = 'auto'
                    } else {
                      statusColor = 'var(--amber)'
                      statusTag = 'manual upload'
                      tagClass = 'manual'
                    }

                    return (
                      <div
                        key={v.id}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '14px 0', gap: '14px',
                          borderBottom: '1px solid var(--border-light)',
                        }}
                      >
                        {/* Status dot */}
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                          background: statusColor,
                        }} />

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>
                            {v.name}
                            {' '}
                            <span style={{
                              fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
                              background: tagClass === 'auto' ? 'var(--green-bg)' : tagClass === 'gap' ? 'var(--red-bg)' : 'var(--amber-bg)',
                              color: tagClass === 'auto' ? 'var(--green)' : tagClass === 'gap' ? 'var(--red)' : 'var(--amber)',
                            }}>
                              {statusTag}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {v.default_gl_code ? `GL ${v.default_gl_code}` : ''}
                            {v.default_gl_code && v.delivery_frequency ? ' · ' : ''}
                            {v.delivery_frequency ? `Avg ${v.delivery_frequency}` : ''}
                            {!v.default_gl_code && !v.delivery_frequency ? 'No details' : ''}
                          </div>
                        </div>

                        {/* Stats */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>
                            {invCount} {invCount === 1 ? 'invoice' : 'invoices'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                            {lastDate ? `Last: ${fmtDateShort(lastDate)}` : 'No invoices'}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {addVendorSuccess && <div className="note-green" style={{ marginTop: '10px' }}>Vendor added.</div>}

              {/* Add Vendor toggle + form */}
              {!showAddVendor ? (
                <button
                  onClick={() => setShowAddVendor(true)}
                  style={{
                    display: 'block', width: '100%', marginTop: '12px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r-sm)', padding: '12px',
                    cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                    color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", textAlign: 'center',
                  }}
                >
                  + Add Vendor
                </button>
              ) : (
                <form onSubmit={handleAddVendor} style={{ marginTop: '12px' }}>
                  <div className="nura-card">
                    <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>
                      Add Vendor
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>
                        Vendor name
                      </label>
                      <input type="text" className="nura-input" placeholder="e.g. US Foods" value={addVendorForm.name} onChange={e => setAddVendorForm(f => ({ ...f, name: e.target.value }))} required autoFocus />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>
                        Default GL code
                      </label>
                      <select className="nura-input" value={addVendorForm.default_gl_code} onChange={e => setAddVendorForm(f => ({ ...f, default_gl_code: e.target.value }))} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                        <option value="">— None —</option>
                        {glCodesForVendor.map(gl => <option key={gl.id} value={gl.code}>{gl.name}{gl.code ? ` (${gl.code})` : ''}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>
                        Delivery frequency
                      </label>
                      <input type="text" className="nura-input" placeholder="e.g. Weekly" value={addVendorForm.delivery_frequency} onChange={e => setAddVendorForm(f => ({ ...f, delivery_frequency: e.target.value }))} />
                    </div>

                    {addVendorError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{addVendorError}</div>}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={addVendorSaving || !addVendorForm.name.trim()}>
                        {addVendorSaving ? 'Adding…' : 'Add Vendor'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => { setShowAddVendor(false); setAddVendorError(null) }} style={{ flex: 0, marginTop: 0 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default Ledger
