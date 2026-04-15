import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtPct } from '../lib/utils'
import { createPropertyWithDefaults } from '../lib/propertyUtils'
import { extractSalesData } from '../lib/claudeApi'
import AddInvoiceModal from '../components/AddInvoiceModal'

// ── Onboarding — Zero to Value in 48 Hours ────────────────────────────────────
// 7-step onboarding that ends with real data on the dashboard.
// Every step saves to Supabase before advancing — no data loss on close.
//
// Steps:
//   1  welcome    — Brand intro, one CTA
//   2  property   — Restaurant name, timezone, prime cost target
//   3  role       — Role card selection (owner/gm/controller/viewer)
//   4  gl         — GL code budget config + vendor seeding
//   5  sales      — Last week's sales (skippable)
//   6  labor      — Labor cost for the period (skippable)
//   7  invoice    — First invoice inline form + processing animation (skippable)
//   —  done       — Live dashboard snapshot: prime cost, sales, food budget, invoices

const STEPS = ['welcome', 'property', 'gl', 'sales', 'labor', 'invoice', 'done', 'more-properties']
const TOTAL_STEPS = 6 // welcome → invoice; done and more-properties are completion screens

const STEP_LABEL = {
  welcome:  'Welcome',
  property: 'Restaurant Setup',
  gl:       'Spending Categories',
  sales:    'Last Month\'s Sales',
  labor:    'Labor Cost',
  invoice:  'First Invoice',
  done:     'Complete',
}

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (New York)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage',   label: 'Alaska' },
  { value: 'Pacific/Honolulu',    label: 'Hawaii' },
]

const DEFAULT_GL_CODES = [
  { code: '', name: 'Food Purchases',     category: 'food',     monthly_budget: 0, sort_order: 1 },
  { code: '', name: 'Liquor',             category: 'liquor',   monthly_budget: 0, sort_order: 2 },
  { code: '', name: 'Wine',               category: 'wine',     monthly_budget: 0, sort_order: 3 },
  { code: '', name: 'Beer',               category: 'beer',     monthly_budget: 0, sort_order: 4 },
  { code: '', name: 'Operating Supplies', category: 'supplies', monthly_budget: 0, sort_order: 5 },
  { code: '', name: 'Uniforms',           category: 'uniforms', monthly_budget: 0, sort_order: 6 },
]

// ── Label style reused across form fields ─────────────────────────────────────

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--text-4)',
  marginBottom: '6px',
}

const fieldWrap = { marginBottom: '14px' }

const skipBtn = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-4)',
  fontSize: '13px',
  display: 'block',
  textAlign: 'center',
  width: '100%',
  padding: '8px 0',
  fontFamily: "'DM Sans', sans-serif",
}

// ── Main component ────────────────────────────────────────────────────────────

const Onboarding = () => {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  // If returning from DelegationFork Card 1 ("I'll set it up myself"),
  // profile already has a property — resume at GL step, not welcome
  const resumeStep = (profile?.property_id && profile?.properties) ? 'gl' : 'welcome'

  const [step, setStep] = useState(resumeStep)
  const stepIdx = STEPS.indexOf(step)

  // Shared state persisted across steps — restore from profile if returning
  const [createdProperty, setCreatedProperty] = useState(
    (profile?.property_id && profile?.properties) ? profile.properties : null
  )
  const [budgets,         setBudgets]         = useState(DEFAULT_GL_CODES.map(g => ({ ...g })))

  // ── Step 2: Property ────────────────────────────────────────────────────────
  const [propForm,    setPropForm]    = useState({ name: '', timezone: 'America/New_York' })
  const [propLoading, setPropLoading] = useState(false)
  const [propError,   setPropError]   = useState(null)

  // ── Step 3: GL Codes ────────────────────────────────────────────────────────
  const [glLoading, setGlLoading] = useState(false)
  const [glError,   setGlError]   = useState(null)

  // ── Step 4: Sales (AI-first with manual fallback) ───────────────────────────
  // Modes: 'choose' → pick method | 'processing' → AI running | 'review' → edit extracted rows | 'manual' → manual form
  const [salesMode,      setSalesMode]      = useState('choose')
  const [salesFiles,     setSalesFiles]     = useState([]) // Array<{ file, base64, mediaType, filename }>
  const [salesExtracted, setSalesExtracted] = useState([]) // Array<period>
  const [salesForm,      setSalesForm]      = useState({ period_start: '', period_end: '', food_sales: '', beverage_sales: '', total_sales: '' })
  const [salesLoading,   setSalesLoading]   = useState(false)
  const [salesError,     setSalesError]     = useState(null)

  // ── Step 6: Labor ───────────────────────────────────────────────────────────
  const [laborForm,    setLaborForm]    = useState({ period_start: '', period_end: '', total_labor: '' })
  const [laborLoading, setLaborLoading] = useState(false)
  const [laborError,   setLaborError]   = useState(null)

  // ── Step 7: Invoice — AI modal trigger ──────────────────────────────────────
  const [showInvModal, setShowInvModal] = useState(false)

  // ── Done screen data ────────────────────────────────────────────────────────
  const [doneData,    setDoneData]    = useState(null)
  const [doneLoading, setDoneLoading] = useState(false)

  // ── Navigation helpers ──────────────────────────────────────────────────────

  const advance = () => {
    const next = STEPS[stepIdx + 1]
    if (next) setStep(next)
  }

  const goBack = () => {
    const prev = STEPS[stepIdx - 1]
    if (prev && prev !== 'done') setStep(prev)
  }

  // ── Done screen: fetch actual dashboard state ───────────────────────────────

  const fetchDoneData = useCallback(async () => {
    if (!createdProperty) { setDoneData({}); return }
    setDoneLoading(true)
    const propertyId = createdProperty.id

    const now   = new Date()
    const y     = now.getFullYear()
    const m     = now.getMonth() + 1
    const start = `${y}-${String(m).padStart(2, '0')}-01`
    const last  = new Date(y, m, 0).getDate()
    const end   = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`

    const [salesRes, laborRes, invRes, glRes, pendingRes] = await Promise.all([
      supabase.from('sales_entries').select('total_sales').eq('property_id', propertyId).gte('date', start).lte('date', end),
      supabase.from('labor_entries').select('total_labor').eq('property_id', propertyId).lte('period_start', end).gte('period_end', start),
      supabase.from('invoices').select('amount, gl_code').eq('property_id', propertyId).eq('status', 'approved').gte('invoice_date', start).lte('invoice_date', end),
      supabase.from('gl_codes').select('code, name, monthly_budget, category').eq('property_id', propertyId).eq('is_active', true),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).neq('status', 'held'),
    ])

    const totalSales = (salesRes.data || []).reduce((s, r) => s + Number(r.total_sales), 0)
    const totalLabor = (laborRes.data || []).reduce((s, r) => s + Number(r.total_labor), 0)
    const approved   = invRes.data || []
    const glList     = glRes.data  || []

    const foodBevCodes = glList.filter(g => ['food', 'liquor', 'wine', 'beer'].includes(g.category)).map(g => g.code)
    const fbCogs       = approved.filter(i => foodBevCodes.includes(i.gl_code)).reduce((s, i) => s + Number(i.amount), 0)
    const primeCostPct = totalSales > 0 ? ((fbCogs + totalLabor) / totalSales) * 100 : null

    const foodGl       = glList.find(g => g.category === 'food')
    const foodSpent    = approved.filter(i => i.gl_code === foodGl?.code).reduce((s, i) => s + Number(i.amount), 0)
    const foodRemaining = foodGl ? Number(foodGl.monthly_budget) - foodSpent : null

    setDoneData({
      totalSales:   totalSales > 0   ? totalSales   : null,
      totalLabor:   totalLabor > 0   ? totalLabor   : null,
      primeCostPct,
      foodRemaining,
      invoiceCount: pendingRes.count ?? 0,
    })
    setDoneLoading(false)
  }, [createdProperty])

  useEffect(() => {
    if (step === 'done') fetchDoneData()
  }, [step, fetchDoneData])

  // ── Step handlers ───────────────────────────────────────────────────────────

  const handleProperty = async () => {
    if (!propForm.name.trim()) return
    setPropLoading(true)
    setPropError(null)

    const { data: newProp, error: propErr } = await supabase
      .from('properties')
      .insert({
        name:               propForm.name.trim(),
        timezone:           propForm.timezone,
        prime_cost_target:  62.0,
        owner_id:           profile.id,
      })
      .select()
      .single()

    if (propErr) { setPropError(propErr.message); setPropLoading(false); return }

    setCreatedProperty(newProp)

    // Link profile to the new property + assign owner role
    // Pull first/last name from auth signup metadata (set during account creation)
    const meta = (await supabase.auth.getUser()).data?.user?.user_metadata || {}
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        property_id:         newProp.id,
        role:                'owner',
        onboarding_complete: false,
        first_name:          meta.first_name || null,
        last_name:           meta.last_name || null,
      })
      .eq('id', profile.id)

    setPropLoading(false)
    if (profileErr) { setPropError(profileErr.message); return }

    // Route to Delegation Fork — owner chooses self-setup vs controller delegation
    await refreshProfile()
    navigate('/onboarding/who-sets-up')
  }

  const handleGl = async () => {
    if (!createdProperty) return
    setGlLoading(true)
    setGlError(null)
    const propertyId = createdProperty.id

    // Upsert GL codes
    const glRows = budgets.map(b => ({
      property_id:    propertyId,
      code:           b.code,
      name:           b.name,
      category:       b.category,
      monthly_budget: parseFloat(b.monthly_budget) || 0,
      sort_order:     b.sort_order,
    }))

    // Use insert (not upsert) to avoid collisions when code is empty string
    // Delete existing codes for this property first, then re-insert all
    await supabase.from('gl_codes').delete().eq('property_id', propertyId)
    const { error: glErr } = await supabase
      .from('gl_codes')
      .insert(glRows)

    if (glErr) { setGlError(glErr.message); setGlLoading(false); return }

    setGlLoading(false)
    advance()
  }

  const handleSalesFileSelect = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setSalesError(null)

    const encoded = await Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result.toString().split(',')[1]
        resolve({ file, base64, mediaType: file.type, filename: file.name })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })))

    setSalesFiles(prev => [...prev, ...encoded])
  }

  const handleSalesRemoveFile = (idx) => {
    setSalesFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSalesExtract = async () => {
    if (salesFiles.length === 0) {
      setSalesError('Upload at least one document first.')
      return
    }
    setSalesMode('processing')
    setSalesError(null)

    try {
      const result = await extractSalesData(salesFiles.map(f => ({
        base64:    f.base64,
        mediaType: f.mediaType,
        filename:  f.filename,
      })))
      setSalesExtracted(result.periods || [])
      setSalesMode('review')
    } catch (err) {
      setSalesError(err.message || 'Could not read those documents. Try again or enter manually.')
      setSalesMode('choose')
    }
  }

  const handleSalesSaveExtracted = async () => {
    if (!createdProperty || salesExtracted.length === 0) {
      advance()
      return
    }
    setSalesLoading(true)
    setSalesError(null)

    const rows = salesExtracted.map(p => ({
      property_id:    createdProperty.id,
      date:           p.period_end || p.period_start,
      food_sales:     p.food_sales ?? null,
      beverage_sales: p.beverage_sales ?? null,
      total_sales:    p.total_sales ?? 0,
      entered_by:     profile.id,
    }))

    const { error } = await supabase.from('sales_entries').upsert(rows, { onConflict: 'property_id,date' })
    setSalesLoading(false)
    if (error) { setSalesError(error.message); return }
    advance()
  }

  const handleSalesManualSave = async () => {
    if (!salesForm.period_end || !salesForm.total_sales) {
      setSalesError('Period end date and total sales are required.')
      return
    }
    setSalesLoading(true)
    setSalesError(null)

    const { error } = await supabase.from('sales_entries').upsert({
      property_id:    createdProperty.id,
      date:           salesForm.period_end,
      food_sales:     parseFloat(salesForm.food_sales)     || null,
      beverage_sales: parseFloat(salesForm.beverage_sales) || null,
      total_sales:    parseFloat(salesForm.total_sales)    || 0,
      entered_by:     profile.id,
    }, { onConflict: 'property_id,date' })

    setSalesLoading(false)
    if (error) { setSalesError(error.message); return }
    advance()
  }

  const handleLabor = async (skip = false) => {
    if (skip) { advance(); return }
    if (!laborForm.period_start || !laborForm.period_end || !laborForm.total_labor) {
      setLaborError('All fields are required.')
      return
    }
    setLaborLoading(true)
    setLaborError(null)

    const { error } = await supabase.from('labor_entries').insert({
      property_id:  createdProperty.id,
      period_start: laborForm.period_start,
      period_end:   laborForm.period_end,
      total_labor:  parseFloat(laborForm.total_labor),
      entered_by:   profile.id,
    })

    setLaborLoading(false)
    if (error) { setLaborError(error.message); return }
    advance()
  }

  const handleOpenNura = async () => {
    // Mark onboarding as complete so ProtectedRoute allows dashboard access
    await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', profile.id)
    await refreshProfile()
    navigate('/', { replace: true })
  }

  // ── More properties step state ────────────────────────────────────────────
  const [showAddPropForm, setShowAddPropForm] = useState(false)
  const [addPropForm, setAddPropForm] = useState({ name: '', timezone: 'America/New_York', prime_cost_target: '62.0' })
  const [addPropLoading, setAddPropLoading] = useState(false)
  const [addPropError, setAddPropError]     = useState(null)

  const handleAddAnotherProperty = async () => {
    if (!addPropForm.name.trim()) return
    setAddPropLoading(true)
    setAddPropError(null)

    const { property: newProp, error } = await createPropertyWithDefaults({
      name:              addPropForm.name.trim(),
      timezone:          addPropForm.timezone,
      prime_cost_target: parseFloat(addPropForm.prime_cost_target) || 62.0,
    }, profile.id)

    setAddPropLoading(false)

    if (error) { setAddPropError(error); return }

    // Reset form for another add
    setAddPropForm({ name: '', timezone: 'America/New_York', prime_cost_target: '62.0' })

    // Update createdProperty to the new one and go back to done screen
    setCreatedProperty(newProp)
    setStep('done')
  }

  // ── Progress bar ────────────────────────────────────────────────────────────

  const stepNum   = stepIdx + 1 // 1-7 for welcome→invoice; 8 for done (unused)
  const showProg  = step !== 'done' && step !== 'more-properties'
  const showBack  = stepIdx > 0 && step !== 'done' && step !== 'more-properties'
  const progWidth = `${(stepNum / TOTAL_STEPS) * 100}%`

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* ── Progress indicator ── */}
        {showProg && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-4)' }}>
                Step {stepNum} of {TOTAL_STEPS}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>{STEP_LABEL[step]}</div>
            </div>
            <div style={{ background: 'var(--surface-alt)', height: '3px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: progWidth, background: 'var(--amber)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* ── Back button ── */}
        {showBack && (
          <button
            onClick={goBack}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: '13px', padding: '0 0 18px',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontFamily: "'DM Sans', sans-serif",
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
            Back
          </button>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 1 — WELCOME
        ══════════════════════════════════════════════════ */}
        {step === 'welcome' && (
          <div style={{ textAlign: 'center', paddingTop: '24px' }}>
            <div
              className="font-newsreader"
              style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: '20px' }}
            >
              NURA
            </div>
            <div style={{ fontSize: '16px', color: 'var(--text-2)', marginBottom: '10px', lineHeight: '1.6' }}>
              Real-time financial clarity for hospitality.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-4)', marginBottom: '40px', lineHeight: '1.7' }}>
              Set up your restaurant in 6 steps. By the time you finish, your dashboard will show real data — prime cost, budgets, and your first invoice coded.
            </div>
            <button className="btn-primary" onClick={advance}>Get started →</button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 2 — PROPERTY SETUP
        ══════════════════════════════════════════════════ */}
        {step === 'property' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Your restaurant</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Two fields. This creates your restaurant's profile in NURA.
            </div>

            <div className="nura-card">
              <div style={fieldWrap}>
                <label htmlFor="prop-name" style={lbl}>Restaurant name</label>
                <input
                  id="prop-name"
                  type="text"
                  className="nura-input"
                  placeholder="e.g. SYN"
                  value={propForm.name}
                  onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="prop-tz" style={lbl}>Timezone</label>
                <select id="prop-tz" className="nura-select" value={propForm.timezone} onChange={e => setPropForm(f => ({ ...f, timezone: e.target.value }))}>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>
            </div>

            {propError && <div style={{ fontSize: '13px', color: 'var(--red)', margin: '10px 0' }}>{propError}</div>}

            <button
              className="btn-primary"
              onClick={handleProperty}
              disabled={propLoading || !propForm.name.trim()}
              style={{ marginTop: '12px' }}
            >
              {propLoading ? 'Creating…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 3 — GL CODES & BUDGETS
        ══════════════════════════════════════════════════ */}
        {step === 'gl' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Spending categories</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Set a monthly budget for each category. NURA will track your spend against these targets on your dashboard. You can add, rename, or adjust these anytime in Settings.
            </div>

            {budgets.every(b => !b.monthly_budget) && (
              <div className="note-amber" style={{ marginBottom: '14px' }}>
                Set at least one budget so your dashboard shows remaining spend. Skip for now if you'd rather add these later.
              </div>
            )}

            <div className="nura-card" style={{ marginBottom: '14px' }}>
              {budgets.map((b, i) => (
                <div
                  key={b.sort_order}
                  style={{
                    padding: '12px 0',
                    borderBottom: i < budgets.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: '500', flex: 1 }}>{b.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={b.monthly_budget || ''}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0
                        setBudgets(prev => prev.map((x, j) => j === i ? { ...x, monthly_budget: val } : x))
                      }}
                      className="nura-input"
                      style={{ width: '110px', padding: '8px 10px', fontSize: '13px', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-4)', marginLeft: '4px' }}>/mo</span>
                  </div>
                </div>
              ))}
            </div>

            {glError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{glError}</div>}

            <button className="btn-primary" onClick={handleGl} disabled={glLoading} style={{ marginBottom: '10px' }}>
              {glLoading ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button onClick={() => advance()} style={skipBtn}>
              Skip for now
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 4 — LAST MONTH'S SALES (AI-FIRST)
        ══════════════════════════════════════════════════ */}
        {step === 'sales' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Last month's sales</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Upload your POS reports and NURA will read them for you. One month of history is enough to light up your dashboard.
            </div>

            {/* ── MODE: CHOOSE ──────────────────────────────────────────── */}
            {salesMode === 'choose' && (
              <>
                {/* Option 1 — Upload / Photo */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Recommended</div>
                  </div>
                  <div className="font-newsreader" style={{ fontSize: '18px', marginBottom: '6px' }}>Upload POS reports</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Snap a photo or upload PDFs from Toast, Square, Clover, or any POS. Multiple files OK. NURA reads them.
                  </div>

                  {salesFiles.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      {salesFiles.map((f, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '12px', color: 'var(--text-2)' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.filename}</div>
                          <button onClick={() => handleSalesRemoveFile(i)} style={{ background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="btn-secondary" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer', marginBottom: '8px' }}>
                    {salesFiles.length === 0 ? '+ Choose files or take photo' : '+ Add another file'}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      capture="environment"
                      onChange={handleSalesFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>

                  {salesFiles.length > 0 && (
                    <button className="btn-primary" onClick={handleSalesExtract} style={{ width: '100%' }}>
                      Extract with NURA →
                    </button>
                  )}
                </div>

                {/* Option 2 — Toast integration (placeholder) */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px', opacity: 0.6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div className="font-newsreader" style={{ fontSize: '18px' }}>Connect Toast</div>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Coming soon</div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px', lineHeight: 1.5 }}>
                    One-click sync with your Toast account. Sales, labor, and tips flow in automatically.
                  </div>
                  <button className="btn-secondary" disabled style={{ width: '100%', cursor: 'not-allowed' }}>
                    Coming soon
                  </button>
                </div>

                {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

                {/* Option 3 — Manual */}
                <button onClick={() => setSalesMode('manual')} style={{ ...skipBtn, marginBottom: '6px' }}>
                  Enter manually instead
                </button>
                <button onClick={() => advance()} style={skipBtn}>
                  Skip for now
                </button>
              </>
            )}

            {/* ── MODE: PROCESSING ──────────────────────────────────────── */}
            {salesMode === 'processing' && (
              <div className="nura-card" style={{ padding: '28px', textAlign: 'center' }}>
                <div className="font-newsreader" style={{ fontSize: '20px', marginBottom: '8px' }}>NURA is reading your reports…</div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>Identifying totals, dates, and breakdowns. This usually takes a few seconds.</div>
              </div>
            )}

            {/* ── MODE: REVIEW ──────────────────────────────────────────── */}
            {salesMode === 'review' && (
              <>
                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  {salesExtracted.length === 0 && (
                    <div style={{ padding: '12px', fontSize: '13px', color: 'var(--text-3)' }}>
                      NURA couldn't find any sales data in those documents. Try a clearer photo or enter manually.
                    </div>
                  )}
                  {salesExtracted.map((p, i) => (
                    <div key={i} style={{ padding: '12px 0', borderBottom: i < salesExtracted.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-4)', marginBottom: '6px' }}>
                        {p.source_filename} · {p.period_start}{p.period_end && p.period_end !== p.period_start ? ` → ${p.period_end}` : ''} · confidence: {p.confidence}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>Food</div>
                          <input
                            type="number" className="nura-input" value={p.food_sales ?? ''}
                            onChange={e => setSalesExtracted(prev => prev.map((x, j) => j === i ? { ...x, food_sales: parseFloat(e.target.value) || null } : x))}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>Beverage</div>
                          <input
                            type="number" className="nura-input" value={p.beverage_sales ?? ''}
                            onChange={e => setSalesExtracted(prev => prev.map((x, j) => j === i ? { ...x, beverage_sales: parseFloat(e.target.value) || null } : x))}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '11px', color: 'var(--text-4)' }}>Total</div>
                          <input
                            type="number" className="nura-input" value={p.total_sales ?? ''}
                            onChange={e => setSalesExtracted(prev => prev.map((x, j) => j === i ? { ...x, total_sales: parseFloat(e.target.value) || 0 } : x))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

                <button className="btn-primary" onClick={handleSalesSaveExtracted} disabled={salesLoading || salesExtracted.length === 0} style={{ marginBottom: '8px' }}>
                  {salesLoading ? 'Saving…' : 'Looks good — Save & Continue →'}
                </button>
                <button onClick={() => { setSalesMode('choose'); setSalesExtracted([]); setSalesFiles([]) }} style={skipBtn}>
                  Start over
                </button>
              </>
            )}

            {/* ── MODE: MANUAL ──────────────────────────────────────────── */}
            {salesMode === 'manual' && (
              <>
                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  <div style={fieldWrap}>
                    <label htmlFor="sales-start" style={lbl}>Period start</label>
                    <input id="sales-start" type="date" className="nura-input"
                      value={salesForm.period_start}
                      onChange={e => setSalesForm(f => ({ ...f, period_start: e.target.value }))} />
                  </div>
                  <div style={fieldWrap}>
                    <label htmlFor="sales-end" style={lbl}>Period end</label>
                    <input id="sales-end" type="date" className="nura-input"
                      value={salesForm.period_end}
                      onChange={e => setSalesForm(f => ({ ...f, period_end: e.target.value }))} />
                  </div>
                  <div style={fieldWrap}>
                    <label htmlFor="sales-food" style={lbl}>Food sales ($)</label>
                    <input id="sales-food" type="number" className="nura-input" placeholder="Optional"
                      value={salesForm.food_sales}
                      onChange={e => setSalesForm(f => ({ ...f, food_sales: e.target.value }))} />
                  </div>
                  <div style={fieldWrap}>
                    <label htmlFor="sales-bev" style={lbl}>Beverage sales ($)</label>
                    <input id="sales-bev" type="number" className="nura-input" placeholder="Optional"
                      value={salesForm.beverage_sales}
                      onChange={e => setSalesForm(f => ({ ...f, beverage_sales: e.target.value }))} />
                  </div>
                  <div>
                    <label htmlFor="sales-total" style={lbl}>Total sales ($)</label>
                    <input id="sales-total" type="number" className="nura-input" placeholder="Required"
                      value={salesForm.total_sales}
                      onChange={e => setSalesForm(f => ({ ...f, total_sales: e.target.value }))} />
                  </div>
                </div>

                {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

                <button className="btn-primary" onClick={handleSalesManualSave} disabled={salesLoading} style={{ marginBottom: '8px' }}>
                  {salesLoading ? 'Saving…' : 'Save & Continue →'}
                </button>
                <button onClick={() => setSalesMode('choose')} style={{ ...skipBtn, marginBottom: '6px' }}>
                  Back to upload
                </button>
                <button onClick={() => advance()} style={skipBtn}>
                  Skip for now
                </button>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 6 — LABOR COST
        ══════════════════════════════════════════════════ */}
        {step === 'labor' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Labor cost</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Your total labor cost for the current period. This is the biggest driver of prime cost.
            </div>

            <div className="nura-card" style={{ marginBottom: '12px' }}>
              <div style={fieldWrap}>
                <label htmlFor="labor-start" style={lbl}>Period start</label>
                <input id="labor-start" type="date" className="nura-input" value={laborForm.period_start} onChange={e => setLaborForm(f => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div style={fieldWrap}>
                <label htmlFor="labor-end" style={lbl}>Period end</label>
                <input id="labor-end" type="date" className="nura-input" value={laborForm.period_end} onChange={e => setLaborForm(f => ({ ...f, period_end: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="labor-total" style={lbl}>Total labor cost ($)</label>
                <input id="labor-total" type="number" className="nura-input" placeholder="e.g. 19053.00" value={laborForm.total_labor} onChange={e => setLaborForm(f => ({ ...f, total_labor: e.target.value }))} />
              </div>
            </div>

            {laborError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{laborError}</div>}

            <button
              className="btn-primary"
              onClick={() => handleLabor(false)}
              disabled={laborLoading}
              style={{ marginBottom: '10px' }}
            >
              {laborLoading ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button onClick={() => handleLabor(true)} style={skipBtn}>
              Skip for now
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 7 — FIRST INVOICE (AI EXTRACTION)
        ══════════════════════════════════════════════════ */}
        {step === 'invoice' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>First invoice</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Upload your most recent invoice. Watch NURA code it automatically and update your budget in real time.
            </div>

            {/* Upload trigger card */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowInvModal(true)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowInvModal(true) } }}
              style={{
                border: '2px dashed rgba(184,134,11,0.3)',
                borderRadius: 'var(--r)',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '16px',
                transition: 'border-color 0.15s',
                outline: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--amber)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(184,134,11,0.3)' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--amber)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(184,134,11,0.3)' }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: '0 auto 12px', display: 'block' }}>
                <rect x="6" y="3" width="16" height="22" rx="2" stroke="var(--amber)" strokeWidth="1.5" />
                <path d="M10 10h8M10 14h6M10 18h4" stroke="var(--amber)" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="24" cy="8" r="3" fill="var(--amber)" opacity="0.3" />
                <path d="M24 5v6M21 8h6" stroke="var(--amber)" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
              </svg>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text)', marginBottom: '4px' }}>
                Tap to upload or scan your first invoice
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-4)' }}>
                PDF, JPG, PNG
              </div>
            </div>

            <button onClick={advance} style={skipBtn}>
              Skip for now
            </button>

            {showInvModal && (
              <AddInvoiceModal
                onClose={() => setShowInvModal(false)}
                onSuccess={() => { setShowInvModal(false); advance() }}
              />
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            DONE — LIVE DASHBOARD SNAPSHOT
        ══════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="font-newsreader" style={{ fontSize: '30px', marginBottom: '8px' }}>
              {createdProperty?.name || 'Your restaurant'} is live on NURA.
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-3)', marginBottom: '28px' }}>
              Here's where you stand today.
            </div>

            {doneLoading ? (
              <div style={{ padding: '24px', color: 'var(--text-4)', fontSize: '13px' }}>Loading your data…</div>
            ) : (
              <div className="stat-grid" style={{ marginBottom: '28px', textAlign: 'left' }}>
                <div className="stat-cell">
                  <div className="stat-label">Prime Cost</div>
                  <div
                    className="stat-val font-newsreader"
                    style={{ color: doneData?.primeCostPct != null ? 'var(--amber)' : 'var(--text-4)' }}
                  >
                    {doneData?.primeCostPct != null ? fmtPct(doneData.primeCostPct) : '—'}
                  </div>
                  {doneData?.primeCostPct == null && (
                    <div className="stat-sub">Add sales &amp; labor</div>
                  )}
                </div>

                <div className="stat-cell">
                  <div className="stat-label">Sales MTD</div>
                  <div className="stat-val font-newsreader" style={{ color: doneData?.totalSales != null ? 'var(--text)' : 'var(--text-4)' }}>
                    {doneData?.totalSales != null ? fmt(doneData.totalSales) : '—'}
                  </div>
                  {doneData?.totalSales == null && (
                    <div className="stat-sub">Add sales data</div>
                  )}
                </div>

                <div className="stat-cell">
                  <div className="stat-label">Food Budget Left</div>
                  <div
                    className="stat-val font-newsreader"
                    style={{ color: doneData?.foodRemaining != null ? ((doneData.foodRemaining >= 0) ? 'var(--green)' : 'var(--orange)') : 'var(--text-4)' }}
                  >
                    {doneData?.foodRemaining != null ? fmt(doneData.foodRemaining) : '—'}
                  </div>
                  {doneData?.foodRemaining == null && (
                    <div className="stat-sub">Add invoices</div>
                  )}
                </div>

                <div className="stat-cell">
                  <div className="stat-label">Invoices</div>
                  <div className="stat-val font-newsreader">
                    {doneData?.invoiceCount ?? '—'}
                  </div>
                  <div className="stat-sub">coded &amp; pending</div>
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={advance}>
              Continue →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            MORE PROPERTIES — optional portfolio expansion
        ══════════════════════════════════════════════════ */}
        {step === 'more-properties' && (
          <div style={{ paddingTop: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '8px' }}>
                Do you have more properties?
              </div>
            </div>

            {!showAddPropForm ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
                {/* Card 1 — Add another property */}
                <div
                  onClick={() => setShowAddPropForm(true)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r, 12px)',
                    padding: '28px 20px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-alt)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px', lineHeight: '1.3' }}>
                    Add another property
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: '1.5' }}>
                    Set up an additional location in your portfolio now
                  </div>
                </div>

                {/* Card 2 — Done for now */}
                <div
                  onClick={handleOpenNura}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r, 12px)',
                    padding: '28px 20px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-alt)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)', marginBottom: '8px', lineHeight: '1.3' }}>
                    I'm done for now
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-3)', lineHeight: '1.5' }}>
                    You can add more properties anytime from your Controller dashboard
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-newsreader" style={{ fontSize: '22px', marginBottom: '6px' }}>New property</div>
                <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '16px', lineHeight: '1.6' }}>
                  This property will get its own GL codes, vendors, and budgets.
                </div>

                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  <div style={fieldWrap}>
                    <label htmlFor="add-prop-name" style={lbl}>Property name</label>
                    <input
                      id="add-prop-name"
                      type="text"
                      className="nura-input"
                      placeholder="e.g. The Hamilton"
                      value={addPropForm.name}
                      onChange={(e) => setAddPropForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div style={fieldWrap}>
                    <label htmlFor="add-prop-tz" style={lbl}>Timezone</label>
                    <select
                      id="add-prop-tz"
                      className="nura-select"
                      value={addPropForm.timezone}
                      onChange={(e) => setAddPropForm(f => ({ ...f, timezone: e.target.value }))}
                    >
                      {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="add-prop-pct" style={lbl}>Prime cost target (%)</label>
                    <input
                      id="add-prop-pct"
                      type="number"
                      className="nura-input"
                      placeholder="62.0"
                      step="0.1"
                      min="0"
                      max="200"
                      value={addPropForm.prime_cost_target}
                      onChange={(e) => setAddPropForm(f => ({ ...f, prime_cost_target: e.target.value }))}
                    />
                  </div>
                </div>

                {addPropError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{addPropError}</div>}

                <button
                  className="btn-primary"
                  onClick={handleAddAnotherProperty}
                  disabled={addPropLoading || !addPropForm.name.trim()}
                  style={{ marginBottom: '10px' }}
                >
                  {addPropLoading ? 'Creating…' : 'Create Property & Continue'}
                </button>
                <button onClick={handleOpenNura} style={skipBtn}>
                  Skip — go to dashboard
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default Onboarding
