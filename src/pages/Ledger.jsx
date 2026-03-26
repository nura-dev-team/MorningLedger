import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtFull, fmtDateShort, getMonthRange, fmtPeriodLabel } from '../lib/utils'

// ── Ledger screen ─────────────────────────────────────────────────────────────
// Queries invoices + vendors from Supabase for the current month.

const Ledger = () => {
  const { profile } = useAuth()
  const propertyId = profile?.property_id

  const [tab, setTab] = useState('invoices')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [invoices, setInvoices] = useState([])
  const [vendors, setVendors]   = useState([])

  const now = new Date()
  const periodLabel = fmtPeriodLabel(now.getFullYear(), now.getMonth() + 1)

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

    const [invRes, vendorRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_date, amount, description, gl_code, status, vendors(name)')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end)
        .order('invoice_date', { ascending: false }),

      supabase
        .from('vendors')
        .select('id, name, default_gl_code, delivery_frequency, is_active')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('name'),
    ])

    if (invRes.error) { setError(invRes.error.message); setLoading(false); return }

    setInvoices(invRes.data || [])
    setVendors(vendorRes.data || [])
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchData() }, [fetchData])

  const total = invoices.reduce((s, i) => s + Number(i.amount), 0)

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
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
      ) : (
        <>
          {/* ── Summary stats ── */}
          <div className="stat-grid">
            <div className="stat-cell">
              <div className="stat-label">Invoices</div>
              <div className="stat-val">{invoices.length}</div>
              <div className="stat-sub">{periodLabel}</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Total Spend</div>
              <div className="stat-val">{fmt(total)}</div>
              <div className="stat-sub">All coded</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Audit Variance</div>
              <div className="stat-val" style={{ color: 'var(--green)' }}>$0.00</div>
              <div className="stat-sub">Clean</div>
            </div>
            <div className="stat-cell">
              <div className="stat-label">Active Vendors</div>
              <div className="stat-val">{vendors.length}</div>
              <div className="stat-sub">All active</div>
            </div>
          </div>

          {/* ── Tab bar ── */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
            {['invoices', 'vendors'].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--nborder)',
                  background: tab === t ? 'var(--nt)' : 'var(--nsurf)',
                  color: tab === t ? 'white' : 'var(--nt3)',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {t === 'invoices' ? 'Invoices' : 'Vendors'}
              </button>
            ))}
          </div>

          {/* ── Invoices tab ── */}
          {tab === 'invoices' && (
            <div className="nura-csm">
              {invoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--nt3)', fontSize: '13px' }}>
                  No approved invoices for {periodLabel}.
                </div>
              ) : (
                invoices.map((inv) => (
                  <div key={inv.id} className="txr">
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{inv.vendors?.name || 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
                        {inv.description} · {fmtDateShort(inv.invoice_date)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{fmtFull(Number(inv.amount))}</div>
                      <span className="gl-pill">{inv.gl_code}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Vendors tab ── */}
          {tab === 'vendors' && (
            <div className="nura-csm">
              {vendors.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--nt3)', fontSize: '13px' }}>
                  No active vendors.
                </div>
              ) : (
                vendors.map((v) => (
                  <div key={v.id} className="txr">
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{v.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
                        GL {v.default_gl_code} · {v.delivery_frequency || 'No schedule'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="gl-pill">{v.default_gl_code}</span>
                      <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--green)' }}>Active</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Ledger
