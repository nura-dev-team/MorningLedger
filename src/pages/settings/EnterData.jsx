import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { extractSalesReport, extractLaborReport } from '../../lib/claudeApi'

// ── Enter Data screen ─────────────────────────────────────────────────────────
// Upload + AI extraction or manual entry for sales, labor, budgets, vendors.

const EXTRACT_STEPS = ['Reading report', 'Extracting data', 'Mapping to dashboard']

const DELIVERY_FREQ_OPTIONS = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly']

const TABS = ['sales', 'labor', 'budgets', 'vendors']

const EnterData = () => {
  const { profile, activePropertyId } = useAuth()
  const navigate = useNavigate()
  const propertyId = activePropertyId

  const [tab, setTab] = useState('sales')

  // ── Sales form state ───────────────────────────────────────────────────────
  const [salesForm, setSalesForm] = useState({
    date:           '',
    week_number:    '',
    food_sales:     '',
    beverage_sales: '',
    total_sales:    '',
  })
  const [savingSales,  setSavingSales]  = useState(false)
  const [salesSuccess, setSalesSuccess] = useState(false)
  const [salesError,   setSalesError]   = useState(null)

  const handleSalesChange = (field) => (e) => {
    const val = e.target.value
    setSalesForm((prev) => {
      const next = { ...prev, [field]: val }
      if ((field === 'food_sales' || field === 'beverage_sales') && next.food_sales && next.beverage_sales) {
        next.total_sales = (parseFloat(next.food_sales || 0) + parseFloat(next.beverage_sales || 0)).toFixed(2)
      }
      return next
    })
  }

  const submitSales = async (e) => {
    e.preventDefault()
    if (!propertyId) return
    setSavingSales(true)
    setSalesError(null)

    const { error } = await supabase.from('sales_entries').upsert({
      property_id:    propertyId,
      date:           salesForm.date,
      week_number:    parseInt(salesForm.week_number) || null,
      food_sales:     parseFloat(salesForm.food_sales) || 0,
      beverage_sales: parseFloat(salesForm.beverage_sales) || 0,
      total_sales:    parseFloat(salesForm.total_sales),
      entered_by:     profile.id,
    }, { onConflict: 'property_id,date' })

    setSavingSales(false)
    if (error) {
      setSalesError(error.message)
    } else {
      setSalesSuccess(true)
      setSalesForm({ date: '', week_number: '', food_sales: '', beverage_sales: '', total_sales: '' })
      setTimeout(() => setSalesSuccess(false), 3000)
    }
  }

  // ── Labor form state ───────────────────────────────────────────────────────
  const [laborForm, setLaborForm] = useState({
    period_start: '',
    period_end:   '',
    total_labor:  '',
  })
  const [savingLabor,  setSavingLabor]  = useState(false)
  const [laborSuccess, setLaborSuccess] = useState(false)
  const [laborError,   setLaborError]   = useState(null)

  const submitLabor = async (e) => {
    e.preventDefault()
    if (!propertyId) return
    setSavingLabor(true)
    setLaborError(null)

    const { error } = await supabase.from('labor_entries').insert({
      property_id:  propertyId,
      period_start: laborForm.period_start,
      period_end:   laborForm.period_end,
      total_labor:  parseFloat(laborForm.total_labor),
      entered_by:   profile.id,
    })

    setSavingLabor(false)
    if (error) {
      setLaborError(error.message)
    } else {
      setLaborSuccess(true)
      setLaborForm({ period_start: '', period_end: '', total_labor: '' })
      setTimeout(() => setLaborSuccess(false), 3000)
    }
  }

  // ── Upload / AI extraction state ────────────────────────────────────────────
  const [salesUploadMode,  setSalesUploadMode]  = useState('idle') // idle | processing | review
  const [salesExtracted,   setSalesExtracted]   = useState([])
  const [salesUploadError, setSalesUploadError] = useState(null)
  const [salesAnimStep,    setSalesAnimStep]    = useState(0)
  const [savingExtSales,   setSavingExtSales]   = useState(false)

  const [laborUploadMode,  setLaborUploadMode]  = useState('idle')
  const [laborExtracted,   setLaborExtracted]   = useState([])
  const [laborUploadError, setLaborUploadError] = useState(null)
  const [laborAnimStep,    setLaborAnimStep]    = useState(0)
  const [savingExtLabor,   setSavingExtLabor]   = useState(false)

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ base64: reader.result.toString().split(',')[1], mediaType: file.type })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const runAnim = (setter) => {
    const t1 = setTimeout(() => setter(1), 800)
    const t2 = setTimeout(() => setter(2), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }

  const handleSalesUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSalesUploadMode('processing')
    setSalesUploadError(null)
    setSalesAnimStep(0)
    const cleanup = runAnim(setSalesAnimStep)
    try {
      const { base64, mediaType } = await fileToBase64(file)
      const result = await extractSalesReport(base64, mediaType)
      cleanup()
      setSalesExtracted(result.entries || [])
      setSalesUploadMode('review')
    } catch (err) {
      cleanup()
      setSalesUploadError(err.message || 'Could not read that file.')
      setSalesUploadMode('idle')
    }
  }

  const saveSalesExtracted = async () => {
    if (!propertyId || salesExtracted.length === 0) return
    setSavingExtSales(true)
    const rows = salesExtracted.map(p => ({
      property_id: propertyId,
      date: p.date,
      week_number: p.week_number || (p.date ? Math.ceil(new Date(p.date + 'T00:00:00').getDate() / 7) : null),
      food_sales: p.food_sales != null ? parseFloat(p.food_sales) : null,
      beverage_sales: p.beverage_sales != null ? parseFloat(p.beverage_sales) : null,
      total_sales: parseFloat(p.total_sales) || 0,
      entered_by: profile.id,
    }))
    const { error } = await supabase.from('sales_entries').upsert(rows, { onConflict: 'property_id,date' })
    setSavingExtSales(false)
    if (error) { setSalesUploadError(error.message); return }
    setSalesSuccess(true)
    setSalesExtracted([])
    setSalesUploadMode('idle')
    setTimeout(() => setSalesSuccess(false), 3000)
  }

  const handleLaborUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setLaborUploadMode('processing')
    setLaborUploadError(null)
    setLaborAnimStep(0)
    const cleanup = runAnim(setLaborAnimStep)
    try {
      const { base64, mediaType } = await fileToBase64(file)
      const result = await extractLaborReport(base64, mediaType)
      cleanup()
      setLaborExtracted(result.entries || [])
      setLaborUploadMode('review')
    } catch (err) {
      cleanup()
      setLaborUploadError(err.message || 'Could not read that file.')
      setLaborUploadMode('idle')
    }
  }

  const saveLaborExtracted = async () => {
    if (!propertyId || laborExtracted.length === 0) return
    setSavingExtLabor(true)
    const rows = laborExtracted.map(p => ({
      property_id: propertyId,
      period_start: p.period_start,
      period_end: p.period_end,
      total_labor: parseFloat(p.total_labor) || 0,
      entered_by: profile.id,
    }))
    const { error } = await supabase.from('labor_entries').insert(rows)
    setSavingExtLabor(false)
    if (error) { setLaborUploadError(error.message); return }
    setLaborSuccess(true)
    setLaborExtracted([])
    setLaborUploadMode('idle')
    setTimeout(() => setLaborSuccess(false), 3000)
  }

  // ── Budgets state ──────────────────────────────────────────────────────────
  const [glCodes,       setGlCodes]       = useState([])
  const [budgetEdits,   setBudgetEdits]   = useState({}) // { id: monthly_budget }
  const [loadingBudgets, setLoadingBudgets] = useState(false)
  const [savingBudgets,  setSavingBudgets]  = useState(false)
  const [budgetsSuccess, setBudgetsSuccess] = useState(false)
  const [budgetsError,   setBudgetsError]   = useState(null)

  // ── Vendors state ─────────────────────────────────────────────────────────
  const [vendors,        setVendors]        = useState([])
  const [loadingVendors, setLoadingVendors] = useState(false)
  const [savingVendor,   setSavingVendor]   = useState(false)
  const [vendorSuccess,  setVendorSuccess]  = useState(false)
  const [vendorError,    setVendorError]    = useState(null)
  const [vendorForm,     setVendorForm]     = useState({
    name: '', default_gl_code: '', delivery_frequency: '', is_active: true,
  })
  const [vendorGlCodes,  setVendorGlCodes]  = useState([])

  // Load vendors + GL codes when Vendors tab is opened
  useEffect(() => {
    if (tab !== 'vendors' || !propertyId) return
    setLoadingVendors(true)
    Promise.all([
      supabase.from('vendors').select('*').eq('property_id', propertyId).order('name'),
      supabase.from('gl_codes').select('id, code, name').eq('property_id', propertyId).eq('is_active', true).order('sort_order'),
    ]).then(([vendorRes, glRes]) => {
      setVendors(vendorRes.data || [])
      setVendorGlCodes(glRes.data || [])
      setLoadingVendors(false)
    })
  }, [tab, propertyId])

  const submitVendor = async (e) => {
    e.preventDefault()
    if (!propertyId || !vendorForm.name.trim()) return
    setSavingVendor(true)
    setVendorError(null)

    const { data, error } = await supabase.from('vendors').insert({
      property_id:        propertyId,
      name:               vendorForm.name.trim(),
      default_gl_code:    vendorForm.default_gl_code || null,
      delivery_frequency: vendorForm.delivery_frequency || null,
      is_active:          vendorForm.is_active,
    }).select().single()

    setSavingVendor(false)
    if (error) {
      setVendorError(error.message)
    } else {
      setVendors((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setVendorForm({ name: '', default_gl_code: '', delivery_frequency: '', is_active: true })
      setVendorSuccess(true)
      setTimeout(() => setVendorSuccess(false), 3000)
    }
  }

  // Load GL codes when Budgets tab is opened
  useEffect(() => {
    if (tab !== 'budgets' || !propertyId) return
    setLoadingBudgets(true)
    supabase
      .from('gl_codes')
      .select('id, code, name, monthly_budget, sort_order')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const codes = data || []
        setGlCodes(codes)
        // Pre-fill edit values from current DB values
        const edits = {}
        for (const g of codes) edits[g.id] = String(g.monthly_budget)
        setBudgetEdits(edits)
        setLoadingBudgets(false)
      })
  }, [tab, propertyId])

  const saveBudgets = async (e) => {
    e.preventDefault()
    setSavingBudgets(true)
    setBudgetsError(null)

    // Build upsert rows with updated monthly_budget values
    const rows = glCodes.map((g) => ({
      id:             g.id,
      property_id:    propertyId,
      code:           g.code,
      name:           g.name,
      monthly_budget: parseFloat(budgetEdits[g.id]) || 0,
    }))

    // Use upsert on `id` (primary key) — safe even when `code` is empty
    const { error } = await supabase
      .from('gl_codes')
      .upsert(rows, { onConflict: 'id' })

    setSavingBudgets(false)
    if (error) {
      setBudgetsError(error.message)
    } else {
      setBudgetsSuccess(true)
      setTimeout(() => setBudgetsSuccess(false), 3000)
    }
  }

  // ── Shared field component ─────────────────────────────────────────────────
  const Field = ({ label, type = 'text', value, onChange, placeholder, required }) => (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
        {label}
      </label>
      <input
        type={type}
        className="nura-input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
      />
    </div>
  )

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '14px', padding: 0 }}
        >
          ← Back
        </button>
        <div className="font-newsreader" style={{ fontSize: '18px', fontWeight: 400 }}>Enter Data</div>
        <div style={{ width: '40px' }} />
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '18px', lineHeight: '1.6' }}>
        Upload a report and let NURA read it, or enter data manually below.
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: tab === t ? 'var(--amber)' : 'var(--surface)',
              color: tab === t ? '#0A0A0A' : 'var(--text-3)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {t === 'sales' ? 'Sales' : t === 'labor' ? 'Labor' : t === 'budgets' ? 'Budgets' : 'Vendors'}
          </button>
        ))}
      </div>

      {/* ── Sales tab ── */}
      {tab === 'sales' && (
        <div>
          {/* Upload card */}
          {salesUploadMode === 'idle' && (
            <div className="nura-card" style={{ marginBottom: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>Upload Sales Report</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>CSV, PDF, or photo — NURA reads it</div>
                </div>
              </div>
              <label className="btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*,application/pdf,.csv" capture="environment" onChange={handleSalesUpload} style={{ display: 'none' }} />
              </label>
              {salesUploadError && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '10px' }}>{salesUploadError}</div>}
            </div>
          )}

          {salesUploadMode === 'processing' && (
            <div className="nura-card" style={{ padding: '28px', marginBottom: '16px' }}>
              <div className="font-newsreader" style={{ fontSize: '20px', marginBottom: '16px', textAlign: 'center' }}>NURA is reading your report…</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {EXTRACT_STEPS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: i <= salesAnimStep ? (i < salesAnimStep ? 'var(--green)' : 'var(--amber)') : 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s' }}>
                      {i < salesAnimStep && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      {i === salesAnimStep && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />}
                    </div>
                    <div style={{ fontSize: '13px', color: i <= salesAnimStep ? 'var(--text)' : 'var(--text-4)' }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {salesUploadMode === 'review' && (
            <div className="nura-card" style={{ padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--green)', marginBottom: '12px' }}>Extracted</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Entries</div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{salesExtracted.length}</div>
              </div>
              {salesExtracted.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Date range</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{salesExtracted[0]?.date}{salesExtracted.length > 1 ? ` → ${salesExtracted[salesExtracted.length - 1]?.date}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>Total revenue</div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>${salesExtracted.reduce((s, e) => s + (parseFloat(e.total_sales) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </>
              )}
              {salesUploadError && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '10px' }}>{salesUploadError}</div>}
              <button className="btn-primary" onClick={saveSalesExtracted} disabled={savingExtSales || salesExtracted.length === 0} style={{ marginTop: '14px', marginBottom: '8px' }}>
                {savingExtSales ? 'Saving…' : 'Confirm & Save'}
              </button>
              <button onClick={() => { setSalesUploadMode('idle'); setSalesExtracted([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: '13px', display: 'block', textAlign: 'center', width: '100%', padding: '8px 0' }}>
                Start over
              </button>
            </div>
          )}

          {salesSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Sales data saved.</div>}

          {/* Manual form */}
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>Or enter manually</div>
          <form onSubmit={submitSales}>
            <div className="nura-card" style={{ marginBottom: '12px' }}>
              <Field label="Date"           type="date"   value={salesForm.date}           onChange={handleSalesChange('date')}           required />
              <Field label="Week number"    type="number" value={salesForm.week_number}    onChange={handleSalesChange('week_number')}    placeholder="e.g. 5" />
              <Field label="Food sales"     type="number" value={salesForm.food_sales}     onChange={handleSalesChange('food_sales')}     placeholder="e.g. 3200.00" />
              <Field label="Beverage sales" type="number" value={salesForm.beverage_sales} onChange={handleSalesChange('beverage_sales')} placeholder="e.g. 1400.00" />
              <Field label="Total sales"    type="number" value={salesForm.total_sales}    onChange={handleSalesChange('total_sales')}    placeholder="Auto-filled or enter manually" required />
            </div>

            {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

            <button type="submit" className="btn-primary" disabled={savingSales}>
              {savingSales ? 'Saving…' : 'Save Sales Entry'}
            </button>
          </form>
        </div>
      )}

      {/* ── Labor tab ── */}
      {tab === 'labor' && (
        <div>
          {/* Upload card */}
          {laborUploadMode === 'idle' && (
            <div className="nura-card" style={{ marginBottom: '16px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600 }}>Upload Labor Report</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>CSV, PDF, or timesheet photo — NURA reads it</div>
                </div>
              </div>
              <label className="btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer' }}>
                Upload
                <input type="file" accept="image/*,application/pdf,.csv" capture="environment" onChange={handleLaborUpload} style={{ display: 'none' }} />
              </label>
              {laborUploadError && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '10px' }}>{laborUploadError}</div>}
            </div>
          )}

          {laborUploadMode === 'processing' && (
            <div className="nura-card" style={{ padding: '28px', marginBottom: '16px' }}>
              <div className="font-newsreader" style={{ fontSize: '20px', marginBottom: '16px', textAlign: 'center' }}>NURA is reading your report…</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {EXTRACT_STEPS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, background: i <= laborAnimStep ? (i < laborAnimStep ? 'var(--green)' : 'var(--amber)') : 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s' }}>
                      {i < laborAnimStep && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      {i === laborAnimStep && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />}
                    </div>
                    <div style={{ fontSize: '13px', color: i <= laborAnimStep ? 'var(--text)' : 'var(--text-4)' }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {laborUploadMode === 'review' && (
            <div className="nura-card" style={{ padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--green)', marginBottom: '12px' }}>Extracted</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Entries</div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{laborExtracted.length}</div>
              </div>
              {laborExtracted.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>{p.period_start} → {p.period_end}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>${Number(p.total_labor).toLocaleString(undefined, { minimumFractionDigits: 2 })}{p.unit === 'hours' ? ' (hours)' : ''}</div>
                </div>
              ))}
              {laborUploadError && <div style={{ fontSize: '13px', color: 'var(--red)', marginTop: '10px' }}>{laborUploadError}</div>}
              <button className="btn-primary" onClick={saveLaborExtracted} disabled={savingExtLabor || laborExtracted.length === 0} style={{ marginTop: '14px', marginBottom: '8px' }}>
                {savingExtLabor ? 'Saving…' : 'Confirm & Save'}
              </button>
              <button onClick={() => { setLaborUploadMode('idle'); setLaborExtracted([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: '13px', display: 'block', textAlign: 'center', width: '100%', padding: '8px 0' }}>
                Start over
              </button>
            </div>
          )}

          {laborSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Labor data saved.</div>}

          {/* Manual form */}
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>Or enter manually</div>
          <form onSubmit={submitLabor}>
            <div className="nura-card" style={{ marginBottom: '12px' }}>
              <Field label="Period start" type="date"   value={laborForm.period_start} onChange={(e) => setLaborForm(f => ({ ...f, period_start: e.target.value }))} required />
              <Field label="Period end"   type="date"   value={laborForm.period_end}   onChange={(e) => setLaborForm(f => ({ ...f, period_end:   e.target.value }))} required />
              <Field label="Total labor"  type="number" value={laborForm.total_labor}  onChange={(e) => setLaborForm(f => ({ ...f, total_labor:  e.target.value }))} placeholder="e.g. 19053.00" required />
            </div>

            {laborError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{laborError}</div>}

            <button type="submit" className="btn-primary" disabled={savingLabor}>
              {savingLabor ? 'Saving…' : 'Save Labor Entry'}
            </button>
          </form>
        </div>
      )}

      {/* ── Budgets form ── */}
      {tab === 'budgets' && (
        <form onSubmit={saveBudgets}>
          {loadingBudgets ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <>
              <div className="nura-card" style={{ marginBottom: '12px' }}>
                {glCodes.map((g, i) => (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: i < glCodes.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{g.name}</div>
                      <span className="gl-pill">{g.code}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={budgetEdits[g.id] ?? ''}
                        onChange={(e) => setBudgetEdits((prev) => ({ ...prev, [g.id]: e.target.value }))}
                        style={{
                          width: '90px',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: '13px',
                          textAlign: 'right',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {budgetsError   && <div style={{ fontSize: '13px', color: 'var(--red)',   marginBottom: '10px' }}>{budgetsError}</div>}
              {budgetsSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Budgets saved.</div>}

              <button type="submit" className="btn-primary" disabled={savingBudgets}>
                {savingBudgets ? 'Saving…' : 'Save Budgets'}
              </button>
            </>
          )}
        </form>
      )}
      {/* ── Vendors tab ── */}
      {tab === 'vendors' && (
        <>
          {loadingVendors ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <>
              {/* Existing vendors list */}
              {vendors.length > 0 && (
                <div className="nura-card" style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>
                    Current Vendors
                  </div>
                  {vendors.map((v, i) => (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 0',
                        borderBottom: i < vendors.length - 1 ? '1px solid var(--border)' : 'none',
                        opacity: v.is_active ? 1 : 0.55,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>{v.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>
                          {v.default_gl_code && <span className="gl-pill">{v.default_gl_code}</span>}
                          {v.delivery_frequency && <span style={{ marginLeft: v.default_gl_code ? '6px' : 0 }}>{v.delivery_frequency}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const next = !v.is_active
                          await supabase.from('vendors').update({ is_active: next }).eq('id', v.id)
                          setVendors(prev => prev.map(x => x.id === v.id ? { ...x, is_active: next } : x))
                        }}
                        style={{
                          width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                          background: v.is_active ? 'var(--green)' : 'var(--border)',
                          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: '2px',
                          left: v.is_active ? '20px' : '2px',
                          width: '18px', height: '18px', borderRadius: '50%',
                          background: 'white', transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {vendors.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-4)', fontSize: '13px', marginBottom: '16px' }}>
                  No vendors yet. Add your first vendor below.
                </div>
              )}

              {/* Add Vendor form */}
              <form onSubmit={submitVendor}>
                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>
                    Add Vendor
                  </div>
                  <Field
                    label="Vendor name"
                    value={vendorForm.name}
                    onChange={(e) => setVendorForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. US Foods"
                    required
                  />
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                      Default GL Code
                    </label>
                    <select
                      className="nura-input"
                      value={vendorForm.default_gl_code}
                      onChange={(e) => setVendorForm((f) => ({ ...f, default_gl_code: e.target.value }))}
                    >
                      <option value="">— None —</option>
                      {vendorGlCodes.map((gl) => (
                        <option key={gl.id} value={gl.code}>
                          {gl.name}{gl.code ? ` (${gl.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                      Delivery Frequency
                    </label>
                    <select
                      className="nura-input"
                      value={vendorForm.delivery_frequency}
                      onChange={(e) => setVendorForm((f) => ({ ...f, delivery_frequency: e.target.value }))}
                    >
                      <option value="">— Select —</option>
                      {DELIVERY_FREQ_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)' }}>
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => setVendorForm((f) => ({ ...f, is_active: !f.is_active }))}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                        background: vendorForm.is_active ? 'var(--green)' : 'var(--border)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: vendorForm.is_active ? '20px' : '2px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'var(--text)', transition: 'left 0.2s',
                      }} />
                    </button>
                  </div>
                </div>

                {vendorError   && <div style={{ fontSize: '13px', color: 'var(--red)',   marginBottom: '10px' }}>{vendorError}</div>}
                {vendorSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Vendor added.</div>}

                <button type="submit" className="btn-primary" disabled={savingVendor}>
                  {savingVendor ? 'Saving…' : 'Add Vendor'}
                </button>
              </form>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default EnterData
