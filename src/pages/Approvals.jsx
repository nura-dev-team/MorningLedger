import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmtFull, fmtDateShort, getMonthRange } from '../lib/utils'
import AddInvoiceModal from '../components/AddInvoiceModal'

// ── Acknowledge & Code screen ────────────────────────────────────────────────
// Fetches real pending invoices from Supabase.
// Acknowledge/hold actions write immediately to the invoices table.

const REASONS = [
  'Recurring contract — pre-negotiated',
  'One-time exception',
  'Vendor issue / price change',
  'Custom note…',
]

// ── AckCard ──────────────────────────────────────────────────────────────────

const AckCard = ({ invoice, budgetContext, lastWeekRevenue, onAcknowledge, onHold }) => {
  const [selectedReason, setSelectedReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false) // 'acknowledged' | 'held' | false

  const glBudget = budgetContext[invoice.gl_code]
  const budgetBefore = glBudget ? glBudget.remaining : null
  const budgetAfter = budgetBefore !== null ? budgetBefore - Number(invoice.amount) : null
  const isOver = budgetAfter !== null && budgetAfter < 0
  const requireReason = isOver

  const handleAcknowledge = async () => {
    if (requireReason && !selectedReason) {
      const el = document.getElementById(`reason-${invoice.id}`)
      if (el) el.style.borderColor = 'var(--orange)'
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approval_reason: selectedReason || null,
      })
      .eq('id', invoice.id)

    setSaving(false)
    if (!error) {
      setSaved('acknowledged')
      setTimeout(() => onAcknowledge(invoice.id), 600)
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
      <div className="nura-card" style={{ opacity: 0.5, textAlign: 'center', fontSize: '13px', color: 'var(--text-3)' }}>
        On hold — {invoice.vendors?.name} · {fmtFull(Number(invoice.amount))}
      </div>
    )
  }

  return (
    <div
      className="nura-card"
      style={{
        borderColor: saved === 'acknowledged' ? 'var(--green-border)' : isOver ? 'var(--orange)' : undefined,
        opacity: saved === 'acknowledged' ? 0.6 : 1,
        transition: 'opacity 0.3s',
        padding: '22px',
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>
            {invoice.vendors?.name || 'Unknown'}{glBudget ? ` — ${glBudget.name}` : ''}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-3)', marginTop: '2px' }}>
            {invoice.description} · {fmtDateShort(invoice.invoice_date)} · <span className="gl-pill">{invoice.gl_code}</span>
          </div>
        </div>
        <div className="font-newsreader" style={{ fontSize: '24px', color: isOver ? 'var(--orange)' : 'var(--text)' }}>
          {fmtFull(Number(invoice.amount))}
        </div>
      </div>

      {/* ── 4-cell context grid ── */}
      {budgetBefore !== null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          {/* Budget */}
          <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Budget</div>
            <div style={{
              fontSize: '14px', fontWeight: 600, marginTop: '3px',
              color: budgetBefore < 0 ? 'var(--orange)' : undefined,
            }}>
              {budgetBefore < 0 ? `${fmtFull(Math.abs(budgetBefore))} over` : `${fmtFull(budgetBefore)} left`}
            </div>
          </div>
          {/* After */}
          <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>After</div>
            <div style={{
              fontSize: '14px', fontWeight: 600, marginTop: '3px',
              color: isOver ? 'var(--orange)' : undefined,
            }}>
              {budgetAfter < 0 ? `${fmtFull(Math.abs(budgetAfter))} over` : `${fmtFull(budgetAfter)} left`}
            </div>
          </div>
          {/* Sales pace */}
          <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Sales pace</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '3px' }}>
              {lastWeekRevenue ? `${fmtFull(lastWeekRevenue)} last wk` : '—'}
            </div>
          </div>
          {/* Impact */}
          <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Impact</div>
            <div style={{
              fontSize: '14px', fontWeight: 600, marginTop: '3px',
              color: isOver ? 'var(--orange)' : 'var(--green)',
            }}>
              {isOver ? 'Over budget' : 'Within target'}
            </div>
          </div>
        </div>
      )}

      {/* ── GL coding intelligence ── */}
      <div style={{
        background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)',
        padding: '10px 14px', marginBottom: '12px', fontSize: '12.5px', color: 'var(--text-2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><strong style={{ color: 'var(--text)' }}>GL: {invoice.gl_code}</strong> — {glBudget?.name || 'Unknown'}</span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-3)' }}>Vendor default</span>
        </div>
      </div>

      {/* ── Budget impact banner ── */}
      <div style={{
        padding: '12px 14px', borderRadius: 'var(--r-sm)', fontSize: '13.5px', marginBottom: '14px',
        background: isOver ? 'var(--orange-bg)' : 'var(--green-bg)',
        color: isOver ? 'var(--orange)' : 'var(--green)',
      }}>
        {isOver
          ? 'Over budget. An explanation is required to code this invoice.'
          : 'Within budget. No explanation needed — one tap to code.'}
      </div>

      {/* ── Reason dropdown (over-budget only) ── */}
      {requireReason && !saved && (
        <select
          id={`reason-${invoice.id}`}
          className="nura-select"
          value={selectedReason}
          onChange={(e) => {
            setSelectedReason(e.target.value)
            if (e.target.style) e.target.style.borderColor = 'var(--border)'
          }}
          style={{ marginBottom: '14px' }}
        >
          <option value="">Why is this over budget?</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      {/* ── Actions ── */}
      {!saved ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-primary"
            onClick={handleAcknowledge}
            disabled={saving}
            style={{ flex: 1, ...(isOver ? { background: 'var(--orange)' } : {}) }}
          >
            {saving ? 'Saving…' : 'Acknowledge & Code'}
          </button>
          <button className="btn-secondary" onClick={handleHold} disabled={saving} style={{ flex: 1, marginTop: 0 }}>
            Hold
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '10px', fontSize: '13px', color: 'var(--green)', fontWeight: '600' }}>
          ✓ Coded
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const Approvals = () => {
  const { profile, activePropertyId, periodYear, periodMonth } = useAuth()
  const propertyId = activePropertyId

  const [invoices, setInvoices] = useState([])
  const [budgetContext, setBudgetContext] = useState({})
  const [lastWeekRevenue, setLastWeekRevenue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAddInvoice, setShowAddInvoice] = useState(false)

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const { start, end } = getMonthRange(periodYear, periodMonth)

    const [pendingRes, approvedRes, glRes, salesRes] = await Promise.all([
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

      // Fetch latest week's sales for "Sales pace" cell
      supabase
        .from('sales_entries')
        .select('total_sales, week_number')
        .eq('property_id', propertyId)
        .gte('date', start)
        .lte('date', end)
        .order('week_number', { ascending: false })
        .limit(1),
    ])

    if (pendingRes.error) { setError(pendingRes.error.message); setLoading(false); return }

    const pending = pendingRes.data || []
    const approved = approvedRes.data || []
    const glCodes = glRes.data || []

    // Build budget context
    const ctx = {}
    for (const gl of glCodes) {
      const spent = approved
        .filter((i) => i.gl_code === gl.code)
        .reduce((s, i) => s + Number(i.amount), 0)
      ctx[gl.code] = {
        name: gl.name,
        budget: Number(gl.monthly_budget),
        spent,
        remaining: Number(gl.monthly_budget) - spent,
      }
    }

    // Last week revenue
    const lastSales = salesRes.data?.[0]
    setLastWeekRevenue(lastSales ? Number(lastSales.total_sales) : null)

    setInvoices(pending)
    setBudgetContext(ctx)
    setLoading(false)
  }, [propertyId, periodYear, periodMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const removeInvoice = (id) => setInvoices((prev) => prev.filter((i) => i.id !== id))

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Acknowledge & Code</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!loading && (
            <span className={invoices.length > 0 ? 'bdg bdg-amber' : 'bdg bdg-green'}>
              {invoices.length > 0 ? `${invoices.length} Pending` : 'All Clear'}
            </span>
          )}
          <button
            onClick={() => setShowAddInvoice(true)}
            style={{
              background: 'var(--text)', color: '#FFFFFF', border: 'none',
              borderRadius: '50%', width: '28px', height: '28px', fontSize: '18px',
              lineHeight: '1', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
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
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)', fontSize: '13px' }}>
          Loading…
        </div>
      ) : invoices.length === 0 ? (
        <div
          className="nura-card"
          style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: '14px' }}
        >
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>✓</div>
          No pending invoices. You're all caught up.
        </div>
      ) : (
        invoices.map((inv) => (
          <AckCard
            key={inv.id}
            invoice={inv}
            budgetContext={budgetContext}
            lastWeekRevenue={lastWeekRevenue}
            onAcknowledge={removeInvoice}
            onHold={removeInvoice}
          />
        ))
      )}

      {/* ── Explain block ── */}
      {!loading && invoices.length > 0 && (
        <div style={{
          background: 'var(--surface-alt)', borderLeft: '3px solid var(--border)',
          borderRadius: '0 var(--r-sm) var(--r-sm) 0', padding: '11px 14px',
          fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, marginTop: '10px',
        }}>
          <strong style={{ color: 'var(--text)' }}>Acknowledge & Code</strong> captures context at the moment of spend — not after month-end. Over-budget items require an explanation so controllers see the "why" alongside the number. This is awareness and accountability, not gatekeeping.
        </div>
      )}
    </div>
  )
}

export default Approvals
