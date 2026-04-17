import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { extractInvoiceData, generateBudgetImpactInsight } from '../lib/claudeApi'
import { fmtFull, fmtDateShort, getMonthRange } from '../lib/utils'

// ── Add Invoice Modal — AI Extraction Flow ──────────────────────────────────
// States: upload → processing → review | retry | manual

// 6-step processing animation matching prototype exactly
const PROC_STEPS = [
  'Invoice received',
  'Reading line items',
  'Auto-coding GL (vendor default + AI)',
  'Duplicate check',
  'Price change detection',
  'Checking budget impact',
]

// ── File to base64 ──────────────────────────────────────────────────────────

const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const base64 = dataUrl.split(',')[1]
      const mediaType = file.type || 'image/jpeg'
      resolve({ base64, mediaType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

// ── Document icon ───────────────────────────────────────────────────────────

const DocIcon = ({ size = 32, color = 'var(--text-3)' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <rect x="6" y="3" width="16" height="22" rx="2" stroke={color} strokeWidth="1.5" />
    <path d="M10 10h8M10 14h6M10 18h4" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)

// ── Main component ──────────────────────────────────────────────────────────

const AddInvoiceModal = ({ onClose, onSuccess }) => {
  const { activePropertyId } = useAuth()
  const propertyId = activePropertyId

  // Core state
  const [modalState, setModalState] = useState('upload')
  const [dragOver, setDragOver] = useState(false)

  // File + extraction
  const [selectedFile, setSelectedFile] = useState(null)
  const [extraction, setExtraction] = useState(null)
  const [retryReason, setRetryReason] = useState(null)

  // Processing animation — 6 steps
  const [animStep, setAnimStep] = useState(0) // 0-5: which step is currently active
  const apiResultRef = useRef(null)
  const apiDoneRef = useRef(false)
  const animTimersRef = useRef([])

  // Data for dropdowns + budget context
  const [vendors, setVendors] = useState([])
  const [glCodes, setGlCodes] = useState([])
  const [budgetContext, setBudgetContext] = useState({}) // { glCode: { remaining, budget, name } }
  const [salesMtd, setSalesMtd] = useState(0)

  // Review state
  const [budgetInsight, setBudgetInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newVendorId, setNewVendorId] = useState(null) // set when user adds vendor from review screen
  const [addingVendor, setAddingVendor] = useState(false)

  // Manual form state
  const [manualForm, setManualForm] = useState({
    vendor_id: '', gl_code: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10),
    amount: '', description: '',
  })

  // ── Load vendors + GL codes + budget context ─────────────────────────────
  useEffect(() => {
    if (!propertyId) return
    const now = new Date()
    const { start, end } = getMonthRange(now.getFullYear(), now.getMonth() + 1)

    Promise.all([
      supabase.from('vendors').select('id, name, default_gl_code').eq('property_id', propertyId).eq('is_active', true).order('name'),
      supabase.from('gl_codes').select('id, code, name, category, monthly_budget').eq('property_id', propertyId).eq('is_active', true).order('sort_order'),
      supabase.from('invoices').select('gl_code, amount').eq('property_id', propertyId).eq('status', 'approved').gte('invoice_date', start).lte('invoice_date', end),
      supabase.from('sales_entries').select('total_sales').eq('property_id', propertyId).gte('date', start).lte('date', end),
    ]).then(([vRes, gRes, invRes, salesRes]) => {
      setVendors(vRes.data || [])
      const codes = gRes.data || []
      setGlCodes(codes)

      // Budget context
      const spendByGl = {}
      for (const inv of (invRes.data || [])) {
        spendByGl[inv.gl_code] = (spendByGl[inv.gl_code] || 0) + Number(inv.amount)
      }
      const ctx = {}
      for (const gl of codes) {
        const spent = spendByGl[gl.code] || 0
        ctx[gl.code] = {
          name: gl.name,
          budget: Number(gl.monthly_budget),
          remaining: Number(gl.monthly_budget) - spent,
        }
      }
      setBudgetContext(ctx)
      setSalesMtd((salesRes.data || []).reduce((s, r) => s + Number(r.total_sales), 0))
    })
  }, [propertyId])

  // ── File selection handler ──────────────────────────────────────────────
  const handleFileSelected = useCallback(async (file) => {
    if (!file) return
    setSelectedFile(file)

    try {
      const data = await fileToBase64(file)
      setModalState('processing')
      setAnimStep(0)
      apiDoneRef.current = false
      apiResultRef.current = null

      // Start API call immediately
      extractInvoiceData(data.base64, data.mediaType, glCodes, vendors).then((result) => {
        apiResultRef.current = result
        apiDoneRef.current = true
      })
    } catch (err) {
      console.error('File read error:', err)
      setRetryReason('api_error')
      setModalState('retry')
    }
  }, [glCodes, vendors])

  // ── 6-step processing animation ────────────────────────────────────────
  // Steps advance on timers. After step 5, we wait for the API to finish.
  useEffect(() => {
    if (modalState !== 'processing') return

    // Clear any existing timers
    animTimersRef.current.forEach(clearTimeout)
    animTimersRef.current = []

    // Step 0 is already active (Invoice received). Advance through steps.
    const delays = [800, 1600, 2800, 3600, 4400] // cumulative ms for steps 1-5
    delays.forEach((delay, i) => {
      const t = setTimeout(() => setAnimStep(i + 1), delay)
      animTimersRef.current.push(t)
    })

    return () => animTimersRef.current.forEach(clearTimeout)
  }, [modalState])

  // ── Transition after animation step 5 completes + API done ────────────
  useEffect(() => {
    if (modalState !== 'processing' || animStep < 5) return

    const check = setInterval(() => {
      if (!apiDoneRef.current) return
      clearInterval(check)

      const result = apiResultRef.current
      setTimeout(() => {
        if (!result) {
          setRetryReason('api_error')
          setModalState('retry')
        } else if (result.confidence < 0.5) {
          setExtraction(result)
          setRetryReason('low_confidence')
          setModalState('retry')
        } else {
          setExtraction(result)
          setManualForm((f) => ({
            ...f,
            invoice_number: result.invoice_number || '',
            invoice_date: result.invoice_date || f.invoice_date,
            amount: result.total_amount ? String(result.total_amount) : '',
            description: result.line_items?.[0]?.description?.slice(0, 200) || '',
            gl_code: result.suggested_gl_code || '',
          }))
          setModalState('review')
        }
      }, 400)
    }, 100)

    return () => clearInterval(check)
  }, [modalState, animStep])

  // ── Budget impact insight (fires when review state is entered) ─────────
  useEffect(() => {
    if (modalState !== 'review' || !extraction) return

    const glCode = extraction.suggested_gl_code
    const ctx = budgetContext[glCode]
    if (!ctx || !extraction.total_amount) return

    setInsightLoading(true)
    generateBudgetImpactInsight({
      amount: extraction.total_amount,
      glCode,
      glName: ctx.name,
      budgetRemaining: ctx.remaining,
      budgetTotal: ctx.budget,
      salesMtd,
    }).then((text) => {
      if (text) setBudgetInsight(text)
      setInsightLoading(false)
    })
  }, [modalState, extraction, budgetContext, salesMtd])

  // ── Add vendor from review screen ───────────────────────────────────────
  const handleAddVendorFromReview = async () => {
    if (!extraction?.vendor_name || addingVendor) return
    setAddingVendor(true)

    const { data: created, error } = await supabase.from('vendors').insert({
      property_id: propertyId,
      name: extraction.vendor_name,
      default_gl_code: extraction.suggested_gl_code || null,
      is_active: true,
    }).select('id, name, default_gl_code').single()

    setAddingVendor(false)
    if (error) { console.error('Vendor create error:', error); return }

    setNewVendorId(created.id)
    setVendors(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
  }

  // ── Save from review state ─────────────────────────────────────────────
  const [confirmError, setConfirmError] = useState(null)

  const handleConfirm = async () => {
    if (!extraction || saving) return
    setConfirmError(null)

    if (!extraction.invoice_date) {
      setConfirmError('Invoice date is missing. Tap "Edit first" to add it.')
      return
    }
    if (!extraction.total_amount || extraction.total_amount <= 0) {
      setConfirmError('Invoice amount is missing or zero. Tap "Edit first" to fix it.')
      return
    }
    if (!extraction.suggested_gl_code) {
      setConfirmError('No category assigned. Tap "Edit first" to pick one.')
      return
    }

    setSaving(true)

    const vendorId = newVendorId
      || vendors.find((v) => v.name.toLowerCase() === extraction.vendor_name?.toLowerCase())?.id
      || null

    const { error } = await supabase.from('invoices').insert({
      property_id: propertyId,
      vendor_id: vendorId,
      invoice_number: extraction.invoice_number || null,
      invoice_date: extraction.invoice_date,
      amount: extraction.total_amount,
      description: extraction.line_items?.[0]?.description?.slice(0, 200) || null,
      gl_code: extraction.suggested_gl_code || null,
      status: 'pending',
      extraction_confidence: extraction.confidence,
    })

    setSaving(false)
    if (error) {
      setConfirmError(error.message)
      return
    }
    onSuccess?.()
    onClose()
  }

  // ── Manual form submit ─────────────────────────────────────────────────
  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!manualForm.amount || saving) return
    setSaving(true)

    let vendorId = manualForm.vendor_id
    if (manualForm.vendor_id?.startsWith('__new__')) {
      const newName = extraction?.vendor_name || 'Unknown Vendor'
      const { data: newVendor } = await supabase.from('vendors').insert({
        property_id: propertyId, name: newName,
        default_gl_code: manualForm.gl_code || null, is_active: true,
      }).select('id').single()
      vendorId = newVendor?.id || null
    }

    const { error } = await supabase.from('invoices').insert({
      property_id: propertyId,
      vendor_id: vendorId || null,
      invoice_number: manualForm.invoice_number || null,
      invoice_date: manualForm.invoice_date,
      amount: parseFloat(manualForm.amount),
      description: manualForm.description || null,
      gl_code: manualForm.gl_code || null,
      status: 'pending',
      extraction_confidence: extraction?.confidence || null,
    })

    setSaving(false)
    if (error) { console.error('Insert error:', error); return }
    onSuccess?.()
    onClose()
  }

  // ── Refs ───────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape' && modalState !== 'processing') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, modalState])

  const lbl = {
    display: 'block', fontSize: '11px', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: '0.8px',
    color: 'var(--text-4)', marginBottom: '8px',
  }

  const matchedVendor = extraction?.vendor_name
    ? vendors.find((v) => v.name.toLowerCase() === extraction.vendor_name.toLowerCase())
    : null

  // Budget context for review
  const reviewGlCtx = extraction?.suggested_gl_code ? budgetContext[extraction.suggested_gl_code] : null
  const budgetAfter = reviewGlCtx ? reviewGlCtx.remaining - (extraction?.total_amount || 0) : null
  const isOverBudget = budgetAfter !== null && budgetAfter < 0

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]) }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]) }} />

      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 999, display: 'flex',
          alignItems: isDesktop ? 'center' : 'flex-end',
          justifyContent: isDesktop ? 'center' : 'stretch',
          background: 'var(--overlay)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'fade-in 0.15s ease-out',
        }}
        onClick={(e) => { if (e.target === e.currentTarget && modalState !== 'processing') onClose() }}
      >
        <div style={{
          width: '100%', maxWidth: '500px', maxHeight: isDesktop ? '90dvh' : 'calc(100dvh - 80px)', overflowY: 'auto',
          background: 'var(--surface)', borderRadius: isDesktop ? 'var(--r-lg)' : 'var(--r-lg) var(--r-lg) 0 0',
          padding: isDesktop ? '32px' : '24px 20px 36px', boxShadow: 'var(--shadow-md)',
          animation: isDesktop ? 'modal-enter 0.2s ease-out' : 'modal-enter-mobile 0.25s ease-out',
        }}>

          {/* ── UPLOAD ─────────────────────────────────────────────── */}
          {modalState === 'upload' && (
            <>
              <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, textAlign: 'center', marginBottom: '4px' }}>
                Add Invoice
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text-3)', textAlign: 'center', marginBottom: '24px' }}>
                Snap a photo or drop a file — we'll read and code it
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleFileSelected(e.dataTransfer.files[0]) }}
                style={{
                  border: `2px dashed ${dragOver ? 'var(--text-4)' : 'var(--border)'}`,
                  borderRadius: 'var(--r)', padding: '36px 24px', textAlign: 'center',
                  cursor: 'pointer', marginBottom: '16px',
                  background: dragOver ? 'var(--surface-alt)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ width: '52px', height: '52px', background: 'var(--surface-alt)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <DocIcon size={24} />
                </div>
                <div style={{ fontSize: '15px', fontWeight: 550, marginBottom: '4px' }}>Drop invoice or tap to upload</div>
                <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>PDF, JPG, PNG</div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary" style={{ flex: 1, marginTop: 0 }}>Upload file</button>
                <button onClick={() => cameraInputRef.current?.click()} className="btn-secondary" style={{ flex: 1, marginTop: 0 }}>Scan with camera</button>
              </div>

              <div style={{ textAlign: 'center' }}>
                <button onClick={() => setModalState('manual')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: '13px', textDecoration: 'underline', fontFamily: "'DM Sans', sans-serif" }}>
                  Enter manually instead
                </button>
              </div>
            </>
          )}

          {/* ── PROCESSING — 6-step animation ────────────────────── */}
          {modalState === 'processing' && (
            <div style={{ padding: '8px 0' }}>
              <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, textAlign: 'center', marginBottom: '24px' }}>
                Processing invoice…
              </div>

              <div>
                {PROC_STEPS.map((label, i) => {
                  const isDone = i < animStep
                  const isActive = i === animStep
                  const isWaiting = i > animStep

                  return (
                    <div
                      key={label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 0',
                        borderBottom: i < PROC_STEPS.length - 1 ? '1px solid var(--border-light)' : 'none',
                      }}
                    >
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px',
                        background: isDone ? 'var(--green-bg)' : isActive ? 'var(--amber-bg)' : 'var(--surface-alt)',
                        color: isDone ? 'var(--green)' : isActive ? 'var(--amber)' : 'var(--text-4)',
                        transition: 'all 0.3s',
                      }}>
                        {isDone ? '✓' : isActive ? '⋯' : '○'}
                      </div>
                      <span style={{
                        fontSize: '14px',
                        color: isDone ? 'var(--text-2)' : isActive ? 'var(--text)' : 'var(--text-4)',
                        fontWeight: isActive ? 550 : 400,
                        transition: 'all 0.3s',
                      }}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── RETRY ────────────────────────────────────────────── */}
          {modalState === 'retry' && (
            <div>
              <div className="font-newsreader" style={{ fontSize: '22px', color: 'var(--text)', marginBottom: '8px' }}>
                We had trouble reading this invoice.
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-3)', lineHeight: 1.6, marginBottom: '24px' }}>
                {retryReason === 'low_confidence'
                  ? 'The image may be unclear or the lighting was poor. Try a clearer photo.'
                  : 'Something went wrong processing this invoice.'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <button onClick={() => {
                  setModalState('upload')
                  setSelectedFile(null)
                  setRetryReason(null)
                  setExtraction(null)
                  apiDoneRef.current = false
                  apiResultRef.current = null
                  if (fileInputRef.current) fileInputRef.current.value = ''
                  if (cameraInputRef.current) cameraInputRef.current.value = ''
                }} style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '20px 16px', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>Try again</div>
                </button>
                <button onClick={() => setModalState('manual')} style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '20px 16px', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>Enter manually</div>
                </button>
              </div>
            </div>
          )}

          {/* ── REVIEW — Coded preview matching prototype ────────── */}
          {modalState === 'review' && extraction && (
            <div>
              <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400, textAlign: 'center', marginBottom: '4px' }}>
                Invoice Coded
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text-3)', textAlign: 'center', marginBottom: '16px' }}>
                {extraction.vendor_name || 'Unknown'}{extraction.invoice_number ? ` · ${extraction.invoice_number}` : ''}
              </div>

              {/* Coded preview grid */}
              <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)', padding: '16px', marginBottom: '12px' }}>
                {/* Vendor row with match status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '13.5px' }}>
                  <span style={{ color: 'var(--text-3)' }}>Vendor</span>
                  <span style={{ fontWeight: 550, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {extraction.vendor_name || 'Unknown'}
                    {(matchedVendor || newVendorId) ? (
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: 'var(--green-bg)', color: 'var(--green)' }}>
                        Matched
                      </span>
                    ) : extraction.vendor_name ? (
                      newVendorId ? null : (
                        <button
                          onClick={handleAddVendorFromReview}
                          disabled={addingVendor}
                          style={{
                            fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                            background: 'var(--amber-bg)', color: 'var(--amber)',
                            border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          {addingVendor ? 'Adding…' : '+ Add as vendor'}
                        </button>
                      )
                    ) : null}
                  </span>
                </div>
                {/* Remaining rows */}
                {[
                  ['Amount', `$${extraction.total_amount?.toFixed(2)}`],
                  ['Description', extraction.line_items?.[0]?.description?.slice(0, 60) || '—'],
                  ['GL Code', extraction.suggested_gl_code
                    ? `${extraction.suggested_gl_code} — ${extraction.suggested_gl_name || reviewGlCtx?.name || ''}`
                    : '—'],
                  ['GL Method', (matchedVendor || newVendorId) && (matchedVendor?.default_gl_code || vendors.find(v => v.id === newVendorId)?.default_gl_code) === extraction.suggested_gl_code
                    ? 'Vendor default'
                    : extraction.confidence >= 0.8 ? 'AI suggestion' : 'Review suggested'],
                  ['Date', extraction.invoice_date
                    ? new Date(extraction.invoice_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'],
                  ['Duplicate', null],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13.5px' }}>
                    <span style={{ color: 'var(--text-3)' }}>{label}</span>
                    {label === 'Duplicate' ? (
                      <span style={{ fontWeight: 550, color: 'var(--green)' }}>✓ No match found</span>
                    ) : (
                      <span style={{ fontWeight: 550 }}>{value}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Budget impact banner */}
              {reviewGlCtx && (
                <div style={{
                  padding: '12px 14px', borderRadius: 'var(--r-sm)', fontSize: '13.5px', marginBottom: '12px',
                  background: isOverBudget ? 'var(--orange-bg)' : 'var(--green-bg)',
                  color: isOverBudget ? 'var(--orange)' : 'var(--green)',
                }}>
                  {isOverBudget
                    ? `Over budget. ${reviewGlCtx.name} will be ${fmtFull(Math.abs(budgetAfter))} over after this invoice.`
                    : `Within budget. ${reviewGlCtx.name} remaining after: ${fmtFull(budgetAfter)}`}
                </div>
              )}

              {/* AI budget insight */}
              {(budgetInsight || insightLoading) && (
                <div style={{
                  background: 'var(--surface-alt)', borderLeft: '3px solid var(--border)',
                  borderRadius: '0 var(--r-sm) var(--r-sm) 0', padding: '11px 14px',
                  fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, marginBottom: '12px',
                }}>
                  {insightLoading ? 'Analyzing budget impact…' : budgetInsight}
                </div>
              )}

              {/* Actions */}
              {confirmError && (
                <div style={{ fontSize: '13px', color: 'var(--red)', padding: '10px 14px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', marginTop: '12px' }}>
                  {confirmError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn-primary" onClick={handleConfirm} disabled={saving} style={{ flex: 1 }}>
                  {saving ? 'Saving…' : 'Confirm & Code'}
                </button>
                <button className="btn-secondary" onClick={() => setModalState('manual')} style={{ flex: 1, marginTop: 0 }}>
                  Edit first
                </button>
              </div>
            </div>
          )}

          {/* ── MANUAL ───────────────────────────────────────────── */}
          {modalState === 'manual' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button onClick={() => { setModalState('upload'); setSelectedFile(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '13px', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                  ← Try scanning again
                </button>
              </div>
              <div className="font-newsreader" style={{ fontSize: '20px', fontWeight: 400, color: 'var(--text)', marginBottom: '20px' }}>
                Enter manually
              </div>

              <form onSubmit={handleManualSubmit}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Vendor</label>
                  <select className="nura-input" value={manualForm.vendor_id} onChange={(e) => setManualForm((f) => ({ ...f, vendor_id: e.target.value }))} style={{ background: 'var(--surface-alt)', color: 'var(--text)' }}>
                    <option value="">Select vendor…</option>
                    {extraction?.vendor_name && !matchedVendor && <option value="__new__">+ Add as new vendor: {extraction.vendor_name}</option>}
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    <option value="__new_other__">+ Add different vendor</option>
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>GL Code</label>
                  <select className="nura-input" value={manualForm.gl_code} onChange={(e) => setManualForm((f) => ({ ...f, gl_code: e.target.value }))} style={{ background: 'var(--surface-alt)', color: 'var(--text)' }}>
                    <option value="">Select GL code…</option>
                    {glCodes.map((g) => <option key={g.id} value={g.code}>{g.code ? `${g.code} — ` : ''}{g.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Invoice Number</label>
                  <input type="text" className="nura-input" placeholder="Optional" value={manualForm.invoice_number} onChange={(e) => setManualForm((f) => ({ ...f, invoice_number: e.target.value }))} />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Invoice Date</label>
                  <input type="date" className="nura-input" value={manualForm.invoice_date} onChange={(e) => setManualForm((f) => ({ ...f, invoice_date: e.target.value }))} required />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={lbl}>Amount ($)</label>
                  <input type="number" step="0.01" min="0" className="nura-input" placeholder="e.g. 380.13" value={manualForm.amount} onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))} required />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={lbl}>Description</label>
                  <input type="text" className="nura-input" placeholder="e.g. Food / meats" value={manualForm.description} onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <button type="submit" className="btn-primary" disabled={saving || !manualForm.amount}>
                  {saving ? 'Saving…' : 'Add to Queue'}
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

export default AddInvoiceModal
