import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── Add Invoice Modal ─────────────────────────────────────────────────────────
// Bottom-sheet modal for manually adding an invoice.
// Creates invoice with status='pending' so it appears in the Approvals queue.

const PROCESSING_STEPS = [
  'Reading invoice…',
  'Assigning GL code…',
  'Checking budget…',
]

const AddInvoiceModal = ({ onClose, onSuccess }) => {
  const { activePropertyId } = useAuth()
  const propertyId = activePropertyId

  // Form state
  const [form, setForm] = useState({
    vendor_id:      '',
    invoice_number: '',
    invoice_date:   new Date().toISOString().slice(0, 10),
    amount:         '',
    description:    '',
    gl_code:        '',
  })

  // Data
  const [vendors,  setVendors]  = useState([])
  const [glCodes,  setGlCodes]  = useState([])
  const [loading,  setLoading]  = useState(true)

  // UI state
  const [dupWarning, setDupWarning] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [step,       setStep]       = useState(0) // 0–2 during animation
  const [done,       setDone]       = useState(null) // saved invoice
  const [error,      setError]      = useState(null)

  // Load vendors + GL codes on mount
  useEffect(() => {
    if (!propertyId) return
    Promise.all([
      supabase.from('vendors').select('id, name, default_gl_code').eq('property_id', propertyId).eq('is_active', true).order('name'),
      supabase.from('gl_codes').select('id, code, name, category').eq('property_id', propertyId).eq('is_active', true).order('sort_order'),
    ]).then(([vRes, gRes]) => {
      setVendors(vRes.data || [])
      setGlCodes(gRes.data  || [])
      setLoading(false)
    })
  }, [propertyId])

  // Auto-fill GL code when vendor changes
  const handleVendorChange = (e) => {
    const vendorId = e.target.value
    const vendor = vendors.find((v) => v.id === vendorId)
    setForm((f) => ({
      ...f,
      vendor_id: vendorId,
      gl_code: vendor?.default_gl_code || f.gl_code,
    }))
  }

  // Duplicate invoice number check on blur
  const checkDuplicate = async () => {
    if (!form.invoice_number || !form.vendor_id) return
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .eq('invoice_number', form.invoice_number)
      .eq('vendor_id', form.vendor_id)
    setDupWarning(count > 0)
  }

  // Submit — run 3-step animation while saving
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vendor_id || !form.gl_code || !form.amount) return
    setError(null)
    setProcessing(true)
    setStep(0)

    // Advance animation steps
    const t1 = setTimeout(() => setStep(1), 800)
    const t2 = setTimeout(() => setStep(2), 1600)

    const { data: saved, error: insertErr } = await supabase
      .from('invoices')
      .insert({
        property_id:    propertyId,
        vendor_id:      form.vendor_id,
        invoice_number: form.invoice_number || null,
        invoice_date:   form.invoice_date,
        amount:         parseFloat(form.amount),
        description:    form.description || null,
        gl_code:        form.gl_code,
        status:         'pending',
      })
      .select('*, vendors(name)')
      .single()

    clearTimeout(t1)
    clearTimeout(t2)

    if (insertErr) {
      setProcessing(false)
      setError(insertErr.message)
      return
    }

    // Hold on step 2 briefly before showing result
    setStep(2)
    setTimeout(() => {
      setProcessing(false)
      setDone(saved)
      onSuccess?.()
    }, 600)
  }

  // ── Processing overlay ────────────────────────────────────────────────────

  if (processing) {
    return (
      <Overlay onClose={null}>
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ marginBottom: '28px' }}>
            {PROCESSING_STEPS.map((label, i) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 0',
                  opacity: i <= step ? 1 : 0.3,
                  transition: 'opacity 0.4s',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: i < step ? 'var(--green)' : i === step ? 'var(--amber)' : 'var(--nborder)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    color: 'white',
                    transition: 'background 0.4s',
                  }}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '14px', color: i <= step ? 'var(--nt)' : 'var(--nt4)', textAlign: 'left' }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="skeleton" style={{ height: '4px', borderRadius: '2px', width: `${((step + 1) / 3) * 100}%`, background: 'var(--amber)', transition: 'width 0.6s ease' }} />
        </div>
      </Overlay>
    )
  }

  // ── Success screen ────────────────────────────────────────────────────────

  if (done) {
    return (
      <Overlay onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: '40px', marginBottom: '14px' }}>✓</div>
          <div className="font-newsreader" style={{ fontSize: '22px', marginBottom: '8px' }}>
            Invoice added
          </div>
          <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: 1.6 }}>
            <strong>{done.vendors?.name}</strong> · ${parseFloat(done.amount).toFixed(2)}<br />
            Pending approval · <span className="gl-pill">{done.gl_code}</span>
          </div>
          <span className="bdg bdg-amber" style={{ display: 'inline-block', marginBottom: '24px' }}>
            Pending approval
          </span>
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </Overlay>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <div className="font-newsreader" style={{ fontSize: '20px', fontWeight: 400 }}>Add Invoice</div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt3)', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
        >
          ×
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Vendor */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Vendor</label>
            <select
              className="nura-select"
              value={form.vendor_id}
              onChange={handleVendorChange}
              required
            >
              <option value="">Select vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* GL Code */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>GL Code</label>
            <select
              className="nura-select"
              value={form.gl_code}
              onChange={(e) => setForm((f) => ({ ...f, gl_code: e.target.value }))}
              required
            >
              <option value="">Select GL code…</option>
              {glCodes.map((g) => (
                <option key={g.id} value={g.code}>{g.code} — {g.name}</option>
              ))}
            </select>
          </div>

          {/* Invoice number */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Invoice Number</label>
            <input
              type="text"
              className="nura-input"
              placeholder="e.g. BA-20260129-001"
              value={form.invoice_number}
              onChange={(e) => { setForm((f) => ({ ...f, invoice_number: e.target.value })); setDupWarning(false) }}
              onBlur={checkDuplicate}
            />
            {dupWarning && (
              <div style={{ fontSize: '12px', color: 'var(--orange)', marginTop: '4px' }}>
                ⚠ This invoice number already exists for this vendor.
              </div>
            )}
          </div>

          {/* Date */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Invoice Date</label>
            <input
              type="date"
              className="nura-input"
              value={form.invoice_date}
              onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))}
              required
            />
          </div>

          {/* Amount */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="nura-input"
              placeholder="e.g. 380.13"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              className="nura-input"
              placeholder="e.g. Food / meats"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={!form.vendor_id || !form.gl_code || !form.amount}
          >
            Submit Invoice
          </button>
        </form>
      )}
    </Overlay>
  )
}

// ── Overlay wrapper ───────────────────────────────────────────────────────────

const Overlay = ({ children, onClose }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      display: 'flex',
      alignItems: 'flex-end',
      background: 'rgba(0,0,0,0.4)',
    }}
    onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}
  >
    <div
      style={{
        width: '100%',
        maxHeight: '92dvh',
        overflowY: 'auto',
        background: 'var(--nbg)',
        borderRadius: 'var(--r) var(--r) 0 0',
        padding: '20px 16px 40px',
      }}
    >
      {children}
    </div>
  </div>
)

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--nt4)',
  marginBottom: '6px',
}

export default AddInvoiceModal
