import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtFull, fmtDateShort, getMonthRange } from '../lib/utils'
import AddInvoiceModal from '../components/AddInvoiceModal'

// ── Approvals screen ──────────────────────────────────────────────────────────
// Fetches real pending invoices from Supabase.
// Approve/hold actions write immediately to the invoices table.

const REASONS = [
  'Recurring contract — pre-negotiated',
  'One-time exception',
  'Vendor issue / price change',
  'Custom note…',
]

// ── ApprovalCard ──────────────────────────────────────────────────────────────

const ApprovalCard = ({ invoice, budgetContext, onApprove, onHold }) => {
  const [selectedReason, setSelectedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false) // 'approved' | 'held' | false

  const glBudget    = budgetContext[invoice.gl_code]
  const budgetBefore = glBudget ? glBudget.remaining : null
  const budgetAfter  = budgetBefore !== null ? budgetBefore - Number(invoice.amount) : null
  const isOver       = budgetAfter !== null && budgetAfter < 0
  const requireReason = isOver

  const handleApprove = async () => {
    if (requireReason && !selectedReason) {
      document.getElementById(`reason-${invoice.id}`)?.style && (
        document.getElementById(`reason-${invoice.id}`).style.borderColor = 'var(--orange)'
      )
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('invoices')
      .update({
        status:          'approved',
        approved_at:     new Date().toISOString(),
        approval_reason: selectedReason || null,
      })
      .eq('id', invoice.id)

    setSaving(false)
    if (!error) {
      setSaved('approved')
      setTimeout(() => onApprove(invoice.id), 600)
    }
  }

  const handleHold = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'held' })
      .eq('id', invoice.id)

    setSaving(false)
    if (!error) {
      setSaved('held')
      setTimeout(() => onHold(invoice.id), 600)
    }
  }

  if (saved === 'held') {
    return (
      <div className="nura-card" style={{ opacity: 0.5, textAlign: 'center', fontSize: '13px', color: 'var(--nt3)' }}>
        On hold — {invoice.vendors?.name} · {fmtFull(Number(invoice.amount))}
      </div>
    )
  }

  return (
    <div
      className="nura-card"
      style={{
        borderColor: saved === 'approved' ? 'var(--green-border)' : isOver ? 'var(--orange)' : 'var(--nborder)',
        opacity: saved === 'approved' ? 0.6 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      {/* ── Invoice header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{invoice.vendors?.name || 'Unknown'}</div>
          <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
            {invoice.description} · {fmtDateShort(invoice.invoice_date)} · <span className="gl-pill">{invoice.gl_code}</span>
          </div>
        </div>
        <div
          className="font-newsreader"
          style={{ fontSize: '24px', color: isOver ? 'var(--orange)' : 'var(--nt)' }}
        >
          {fmtFull(Number(invoice.amount))}
        </div>
      </div>

      {/* ── Over-budget warning ── */}
      {isOver && (
        <div
          style={{
            background: 'var(--orange-bg)',
            borderLeft: '3px solid var(--orange)',
            borderRadius: '0 var(--r-sm) var(--r-sm) 0',
            padding: '9px 12px',
            marginBottom: '10px',
            fontSize: '12px',
            color: 'var(--orange)',
          }}
        >
          This will put {glBudget?.name || invoice.gl_code} {fmtFull(Math.abs(budgetAfter))} over budget. A reason is required.
        </div>
      )}

      {/* ── Budget context grid ── */}
      {budgetBefore !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px', margin: '11px 0' }}>
          <div style={{ background: 'var(--nsurf-alt)', borderRadius: 'var(--r-sm)', padding: '9px 11px' }}>
            <div className="stat-label">Budget Before</div>
            <div style={{ fontSize: '15px', fontWeight: '500', marginTop: '3px', color: budgetBefore < 0 ? 'var(--orange)' : 'var(--nt)' }}>
              {budgetBefore < 0 ? `-${fmtFull(Math.abs(budgetBefore))}` : fmtFull(budgetBefore)}
            </div>
          </div>
          <div
            style={{
              background: isOver ? 'var(--orange-bg)' : 'var(--green-bg)',
              borderRadius: 'var(--r-sm)',
              padding: '9px 11px',
            }}
          >
            <div className="stat-label" style={{ color: isOver ? 'var(--orange)' : 'var(--green)' }}>After Approval</div>
            <div style={{ fontSize: '15px', fontWeight: '500', marginTop: '3px', color: isOver ? 'var(--orange)' : 'var(--green)' }}>
              {budgetAfter < 0 ? `-${fmtFull(Math.abs(budgetAfter))}` : fmtFull(budgetAfter)}
            </div>
          </div>
        </div>
      )}

      {/* ── Reason dropdown (over-budget only) ── */}
      {requireReason && !saved && (
        <select
          id={`reason-${invoice.id}`}
          className="nura-select"
          value={selectedReason}
          onChange={(e) => {
            setSelectedReason(e.target.value)
            if (e.target.style) e.target.style.borderColor = 'var(--nborder)'
          }}
          style={{ marginBottom: '8px' }}
        >
          <option value="">Select a reason to approve…</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      {/* ── Actions ── */}
      {!saved ? (
        <>
          <button
            className="btn-primary"
            onClick={handleApprove}
            disabled={saving}
            style={isOver ? { background: 'var(--orange)' } : {}}
          >
            {saving ? 'Saving…' : isOver ? 'Approve with Reason' : 'Approve'}
          </button>
          <button className="btn-secondary" onClick={handleHold} disabled={saving}>
            Hold
          </button>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--green)', fontWeight: '600' }}>
          ✓ Approved
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const Approvals = () => {
  const { profile } = useAuth()
  const propertyId = profile?.property_id

  const [invoices,      setInvoices]      = useState([])
  const [budgetContext, setBudgetContext] = useState({}) // { glCode: { remaining, name } }
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState(null)
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const now = new Date()
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

    const [pendingRes, approvedRes, glRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, vendors(name, default_gl_code)')
        .eq('property_id', propertyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),

      supabase
        .from('invoices')
        .select('gl_code, amount')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end),

      supabase
        .from('gl_codes')
        .select('code, name, monthly_budget')
        .eq('property_id', propertyId)
        .eq('is_active', true),
    ])

    if (pendingRes.error) { setError(pendingRes.error.message); setLoading(false); return }

    const pending  = pendingRes.data || []
    const approved = approvedRes.data || []
    const glCodes  = glRes.data || []

    // Build budget context: remaining budget per GL code this month
    const ctx = {}
    for (const gl of glCodes) {
      const spent = approved
        .filter((i) => i.gl_code === gl.code)
        .reduce((s, i) => s + Number(i.amount), 0)
      ctx[gl.code] = {
        name:      gl.name,
        budget:    Number(gl.monthly_budget),
        spent,
        remaining: Number(gl.monthly_budget) - spent,
      }
    }

    setInvoices(pending)
    setBudgetContext(ctx)
    setLoading(false)
  }, [propertyId])

  useEffect(() => { fetchData() }, [fetchData])

  const removeInvoice = (id) => setInvoices((prev) => prev.filter((i) => i.id !== id))

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Approvals</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!loading && (
            <span className={invoices.length > 0 ? 'bdg bdg-amber' : 'bdg bdg-green'}>
              {invoices.length > 0 ? `${invoices.length} Pending` : 'All Clear'}
            </span>
          )}
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
          onSuccess={() => { setShowAddInvoice(false); fetchData() }}
        />
      )}

      {error && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--nt4)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : invoices.length === 0 ? (
        <div
          className="nura-card"
          style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--nt3)', fontSize: '14px' }}
        >
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>✓</div>
          No pending approvals. You're all caught up.
        </div>
      ) : (
        invoices.map((inv) => (
          <ApprovalCard
            key={inv.id}
            invoice={inv}
            budgetContext={budgetContext}
            onApprove={removeInvoice}
            onHold={removeInvoice}
          />
        ))
      )}
    </div>
  )
}

export default Approvals
