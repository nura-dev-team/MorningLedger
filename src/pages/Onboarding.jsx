import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtPct } from '../lib/utils'
import { createPropertyWithDefaults } from '../lib/propertyUtils'
import { extractSalesReport, extractLaborReport } from '../lib/claudeApi'

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

const STEPS = ['welcome', 'property', 'gl', 'sales', 'labor', 'done', 'more-properties']
const TOTAL_STEPS = 5

const STEP_LABEL = {
  welcome:  'Welcome',
  property: 'Restaurant Setup',
  gl:       'Spending Categories',
  sales:    'Connect Sales',
  labor:    'Connect Labor',
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

const SUGGESTED_CATEGORIES = ['Food', 'Liquor', 'Wine', 'Beer', 'Operating Supplies', 'Uniforms', 'Paper Goods', 'Cleaning', 'Smallwares']

// ── Label style reused across form fields ─────────────────────────────────────

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--text-4)',
  marginBottom: '8px',
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
  const [categories,      setCategories]      = useState([])
  const [newCatName,      setNewCatName]      = useState('')

  // ── Step 2: Property ────────────────────────────────────────────────────────
  const [propForm,    setPropForm]    = useState({ name: '', timezone: 'America/New_York' })
  const [propLoading, setPropLoading] = useState(false)
  const [propError,   setPropError]   = useState(null)

  // ── Step 3: GL Codes ────────────────────────────────────────────────────────
  const [glLoading, setGlLoading] = useState(false)
  const [glError,   setGlError]   = useState(null)

  // ── Step 4: Sales — connect / upload ─────────────────────────────────────────
  const [salesMode,      setSalesMode]      = useState('choose')
  const [salesExtracted, setSalesExtracted] = useState([])
  const [salesLoading,   setSalesLoading]   = useState(false)
  const [salesError,     setSalesError]     = useState(null)
  const [salesAnimStep,  setSalesAnimStep]  = useState(0)

  // ── Step 5: Labor — connect / upload ───────────────────────────────────────
  const [laborMode,      setLaborMode]      = useState('choose')
  const [laborExtracted, setLaborExtracted] = useState([])
  const [laborLoading,   setLaborLoading]   = useState(false)
  const [laborError,     setLaborError]     = useState(null)
  const [laborAnimStep,  setLaborAnimStep]  = useState(0)

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
    if (!propForm.name.trim() || propLoading || createdProperty) return
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

  const addCategory = () => {
    const name = newCatName.trim()
    if (!name || categories.includes(name)) return
    setCategories(prev => [...prev, name])
    setNewCatName('')
  }

  const removeCategory = (name) => {
    setCategories(prev => prev.filter(c => c !== name))
  }

  const handleGl = async () => {
    if (!createdProperty) return
    if (categories.length === 0) { setGlError('Add at least one category.'); return }
    setGlLoading(true)
    setGlError(null)
    const propertyId = createdProperty.id

    const glRows = categories.map((name, i) => ({
      property_id:    propertyId,
      code:           name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name,
      category:       name.toLowerCase(),
      monthly_budget: 0,
      sort_order:     i + 1,
    }))

    await supabase.from('gl_codes').delete().eq('property_id', propertyId)
    const { error: glErr } = await supabase.from('gl_codes').insert(glRows)

    if (glErr) { setGlError(glErr.message); setGlLoading(false); return }

    setGlLoading(false)
    advance()
  }

  // ── File → base64 helper (shared) ────────────────────────────────────────────
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ base64: reader.result.toString().split(',')[1], mediaType: file.type })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  // ── Processing animation helper ─────────────────────────────────────────────
  const EXTRACT_STEPS = ['Reading report', 'Extracting data', 'Mapping to dashboard']
  const runProcessingAnim = (setStep) => {
    const t1 = setTimeout(() => setStep(1), 800)
    const t2 = setTimeout(() => setStep(2), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }

  // ── Sales: upload handler ───────────────────────────────────────────────────
  const handleSalesUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSalesMode('processing')
    setSalesError(null)
    setSalesAnimStep(0)
    const cleanupAnim = runProcessingAnim(setSalesAnimStep)

    try {
      const { base64, mediaType } = await fileToBase64(file)
      const result = await extractSalesReport(base64, mediaType)
      cleanupAnim()
      setSalesExtracted(result.entries || [])
      setSalesMode('review')
    } catch (err) {
      cleanupAnim()
      setSalesError(err.message || 'Could not read that file. Try again or enter manually.')
      setSalesMode('choose')
    }
  }

  // ── Sales: save extracted rows ──────────────────────────────────────────────
  const handleSalesSaveExtracted = async () => {
    if (!createdProperty || salesExtracted.length === 0) { advance(); return }
    setSalesLoading(true)
    setSalesError(null)

    const rows = salesExtracted.map(p => {
      const weekNum = p.week_number || (p.date ? Math.ceil(new Date(p.date + 'T00:00:00').getDate() / 7) : null)
      return {
        property_id:    createdProperty.id,
        date:           p.date,
        week_number:    weekNum,
        food_sales:     p.food_sales != null ? parseFloat(p.food_sales) : null,
        beverage_sales: p.beverage_sales != null ? parseFloat(p.beverage_sales) : null,
        total_sales:    parseFloat(p.total_sales) || 0,
        entered_by:     profile.id,
      }
    })

    const { error } = await supabase.from('sales_entries').upsert(rows, { onConflict: 'property_id,date' })
    setSalesLoading(false)
    if (error) { setSalesError(error.message); return }
    advance()
  }

  // ── Labor: upload handler ───────────────────────────────────────────────────
  const handleLaborUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setLaborMode('processing')
    setLaborError(null)
    setLaborAnimStep(0)
    const cleanupAnim = runProcessingAnim(setLaborAnimStep)

    try {
      const { base64, mediaType } = await fileToBase64(file)
      const result = await extractLaborReport(base64, mediaType)
      cleanupAnim()
      setLaborExtracted(result.entries || [])
      setLaborMode('review')
    } catch (err) {
      cleanupAnim()
      setLaborError(err.message || 'Could not read that file. Try again or enter manually.')
      setLaborMode('choose')
    }
  }

  // ── Labor: save extracted rows ──────────────────────────────────────────────
  const handleLaborSaveExtracted = async () => {
    if (!createdProperty || laborExtracted.length === 0) { advance(); return }
    setLaborLoading(true)
    setLaborError(null)

    const rows = laborExtracted.map(p => ({
      property_id:  createdProperty.id,
      period_start: p.period_start,
      period_end:   p.period_end,
      total_labor:  parseFloat(p.total_labor) || 0,
      entered_by:   profile.id,
    }))

    const { error } = await supabase.from('labor_entries').insert(rows)
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
              Set up your restaurant in 5 steps. By the time you finish, your dashboard will show real data — prime cost, budgets, and revenue.
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
              What do you spend money on? Add the categories that matter to your operation. You'll set budgets for each on your dashboard.
            </div>

            {/* Added categories */}
            {categories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {categories.map(name => (
                  <div key={name} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '20px', padding: '6px 12px', fontSize: '13px', fontWeight: 500,
                  }}>
                    {name}
                    <button
                      onClick={() => removeCategory(name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-4)', fontSize: '14px', padding: 0, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add category input */}
            <div className="nura-card" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="nura-input"
                  placeholder="e.g. Food, Liquor, Paper Goods"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={addCategory}
                  disabled={!newCatName.trim()}
                  className="btn-secondary"
                  style={{ width: 'auto', flex: 'none', padding: '10px 16px', marginTop: 0 }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Suggestions */}
            {categories.length < 3 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                  Common categories
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {SUGGESTED_CATEGORIES.filter(s => !categories.includes(s)).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCategories(prev => [...prev, s])}
                      style={{
                        background: 'var(--surface-alt)', border: '1px solid var(--border)',
                        borderRadius: '20px', padding: '5px 12px', fontSize: '12px', color: 'var(--text-2)',
                        cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        transition: 'border-color 0.15s',
                      }}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {glError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{glError}</div>}

            <button className="btn-primary" onClick={handleGl} disabled={glLoading || categories.length === 0} style={{ marginBottom: '10px' }}>
              {glLoading ? 'Saving…' : `Save ${categories.length} ${categories.length === 1 ? 'category' : 'categories'} & Continue →`}
            </button>
            <button onClick={() => advance()} style={skipBtn}>
              Skip for now
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 4 — CONNECT SALES DATA
        ══════════════════════════════════════════════════ */}
        {step === 'sales' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Connect sales data</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              One month of sales history lights up your dashboard. Connect your POS or upload a report.
            </div>

            {/* ── MODE: CHOOSE ─── three cards ────────────────────────── */}
            {salesMode === 'choose' && (
              <>
                {/* Card 1 — Toast POS */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <img src="/logos/TOST_BIG-732cf225.png" alt="Toast" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Connect Toast</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Automatically sync your sales history. Sales, labor, and tips flow in every day.
                  </div>
                  <button className="btn-secondary" disabled style={{ width: '100%', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    Connect
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 6px', borderRadius: '4px' }}>Coming Soon</span>
                  </button>
                  <div style={{ fontSize: '11px', color: 'var(--text-4)', textAlign: 'center', marginTop: '8px' }}>We'll notify you when this is ready.</div>
                </div>

                {/* Card 2 — Upload a file or photo */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Upload Sales Report</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', lineHeight: 1.5 }}>
                    CSV, PDF, or photo of any sales report — NURA will read it automatically.
                  </div>
                  <label className="btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer' }}>
                    Upload
                    <input type="file" accept="image/*,application/pdf,.csv" capture="environment" onChange={handleSalesUpload} style={{ display: 'none' }} />
                  </label>
                </div>

                {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

                <div style={{ fontSize: '12px', color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5, marginBottom: '12px' }}>
                  You can also enter sales data manually anytime from Settings → Enter Data.
                </div>
                <button onClick={() => advance()} style={skipBtn}>
                  Skip for now
                </button>
              </>
            )}

            {/* ── MODE: PROCESSING ────────────────────────────────────── */}
            {salesMode === 'processing' && (
              <div className="nura-card" style={{ padding: '28px' }}>
                <div className="font-newsreader" style={{ fontSize: '20px', marginBottom: '16px', textAlign: 'center' }}>NURA is reading your report…</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {EXTRACT_STEPS.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        background: i <= salesAnimStep ? (i < salesAnimStep ? 'var(--green)' : 'var(--amber)') : 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.3s',
                      }}>
                        {i < salesAnimStep && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        {i === salesAnimStep && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />}
                      </div>
                      <div style={{ fontSize: '13px', color: i <= salesAnimStep ? 'var(--text)' : 'var(--text-4)' }}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MODE: REVIEW ────────────────────────────────────────── */}
            {salesMode === 'review' && (
              <>
                {salesExtracted.length === 0 ? (
                  <div className="nura-card" style={{ padding: '18px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                      NURA couldn't find sales data in that file. Try a clearer photo or enter manually.
                    </div>
                  </div>
                ) : (
                  <div className="nura-card" style={{ padding: '18px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--green)', marginBottom: '12px' }}>Extracted</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Entries found</div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{salesExtracted.length}</div>
                    </div>
                    {salesExtracted.length > 0 && (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Date range</div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>
                            {salesExtracted[0]?.date}{salesExtracted.length > 1 ? ` → ${salesExtracted[salesExtracted.length - 1]?.date}` : ''}
                          </div>
                        </div>
                        {salesExtracted.some(e => e.food_sales != null) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Food sales</div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              ${salesExtracted.reduce((s, e) => s + (parseFloat(e.food_sales) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        )}
                        {salesExtracted.some(e => e.beverage_sales != null) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Beverage sales</div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              ${salesExtracted.reduce((s, e) => s + (parseFloat(e.beverage_sales) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Total revenue</div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                            ${salesExtracted.reduce((s, e) => s + (parseFloat(e.total_sales) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

                <button className="btn-primary" onClick={handleSalesSaveExtracted} disabled={salesLoading || salesExtracted.length === 0} style={{ marginBottom: '8px' }}>
                  {salesLoading ? 'Saving…' : 'Confirm & Continue →'}
                </button>
                <button onClick={() => { setSalesMode('choose'); setSalesExtracted([]) }} style={skipBtn}>
                  Start over
                </button>
              </>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 5 — CONNECT LABOR DATA
        ══════════════════════════════════════════════════ */}
        {step === 'labor' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Connect labor data</div>
            <div style={{ fontSize: '13px', color: 'var(--text-3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Labor is the other half of prime cost. Connect your scheduling tool or upload a report.
            </div>

            {/* ── MODE: CHOOSE ─── three cards ────────────────────────── */}
            {laborMode === 'choose' && (
              <>
                {/* Card 1 — 7shifts */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <img src="/logos/7shifts-logo.png" alt="7shifts" style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'contain' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Connect 7shifts</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Automatically sync your labor history. Scheduled vs. actual hours and cost flow in daily.
                  </div>
                  <button className="btn-secondary" disabled style={{ width: '100%', cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    Connect
                    <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--amber-bg)', color: 'var(--amber)', padding: '2px 6px', borderRadius: '4px' }}>Coming Soon</span>
                  </button>
                  <div style={{ fontSize: '11px', color: 'var(--text-4)', textAlign: 'center', marginTop: '8px' }}>We'll notify you when this is ready.</div>
                </div>

                {/* Card 2 — Upload a file or photo */}
                <div className="nura-card" style={{ marginBottom: '12px', padding: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Upload Labor Report</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px', lineHeight: 1.5 }}>
                    CSV, PDF, or timesheet photo — NURA will read it.
                  </div>
                  <label className="btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', cursor: 'pointer' }}>
                    Upload
                    <input type="file" accept="image/*,application/pdf,.csv" capture="environment" onChange={handleLaborUpload} style={{ display: 'none' }} />
                  </label>
                </div>

                {laborError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{laborError}</div>}

                <div style={{ fontSize: '12px', color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.5, marginBottom: '12px' }}>
                  You can also enter labor data manually anytime from Settings → Enter Data.
                </div>
                <button onClick={() => advance()} style={skipBtn}>
                  Skip for now
                </button>
              </>
            )}

            {/* ── MODE: PROCESSING ────────────────────────────────────── */}
            {laborMode === 'processing' && (
              <div className="nura-card" style={{ padding: '28px' }}>
                <div className="font-newsreader" style={{ fontSize: '20px', marginBottom: '16px', textAlign: 'center' }}>NURA is reading your report…</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {EXTRACT_STEPS.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                        background: i <= laborAnimStep ? (i < laborAnimStep ? 'var(--green)' : 'var(--amber)') : 'var(--surface-alt)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.3s',
                      }}>
                        {i < laborAnimStep && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        {i === laborAnimStep && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'white' }} />}
                      </div>
                      <div style={{ fontSize: '13px', color: i <= laborAnimStep ? 'var(--text)' : 'var(--text-4)' }}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MODE: REVIEW ────────────────────────────────────────── */}
            {laborMode === 'review' && (
              <>
                {laborExtracted.length === 0 ? (
                  <div className="nura-card" style={{ padding: '18px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>
                      NURA couldn't find labor data in that file. Try a clearer photo or enter manually.
                    </div>
                  </div>
                ) : (
                  <div className="nura-card" style={{ padding: '18px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--green)', marginBottom: '10px' }}>Extracted</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>Entries found</div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{laborExtracted.length}</div>
                    </div>
                    {laborExtracted.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-3)' }}>{p.period_start} → {p.period_end}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          ${Number(p.total_labor).toLocaleString(undefined, { minimumFractionDigits: 2 })}{p.unit === 'hours' ? ' (hours)' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {laborError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{laborError}</div>}

                <button className="btn-primary" onClick={handleLaborSaveExtracted} disabled={laborLoading || laborExtracted.length === 0} style={{ marginBottom: '8px' }}>
                  {laborLoading ? 'Saving…' : 'Confirm & Continue →'}
                </button>
                <button onClick={() => { setLaborMode('choose'); setLaborExtracted([]) }} style={skipBtn}>
                  Start over
                </button>
              </>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════
            DONE — SETUP COMPLETE
        ══════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '16px' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div className="font-newsreader" style={{ fontSize: '30px', marginBottom: '8px' }}>
              {createdProperty?.name || 'Your restaurant'} is live on NURA.
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text-3)', marginBottom: '28px' }}>
              Your dashboard is ready. Here's a preview of what you'll see.
            </div>

            {doneLoading ? (
              <div style={{ padding: '24px', color: 'var(--text-4)', fontSize: '13px' }}>Loading your data…</div>
            ) : (
              <div style={{ marginBottom: '28px', textAlign: 'left' }}>
                {/* Prime Cost */}
                <div className="nura-card" style={{ marginBottom: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>Prime Cost</div>
                      <div className="font-newsreader" style={{ fontSize: '24px', color: doneData?.primeCostPct != null ? 'var(--text)' : 'var(--text-4)' }}>
                        {doneData?.primeCostPct != null ? fmtPct(doneData.primeCostPct) : '—%'}
                      </div>
                    </div>
                    {doneData?.primeCostPct == null && <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>Needs sales + labor</div>}
                  </div>
                </div>

                {/* Sales MTD */}
                <div className="nura-card" style={{ marginBottom: '10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>Sales MTD</div>
                      <div className="font-newsreader" style={{ fontSize: '24px', color: doneData?.totalSales != null ? 'var(--text)' : 'var(--text-4)' }}>
                        {doneData?.totalSales != null ? fmt(doneData.totalSales) : '$—'}
                      </div>
                    </div>
                    {doneData?.totalSales == null && <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>Upload a sales report</div>}
                  </div>
                </div>

                {/* Remaining Budget */}
                <div className="nura-card" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '4px' }}>Remaining Budget</div>
                      <div className="font-newsreader" style={{ fontSize: '24px', color: doneData?.foodRemaining != null ? 'var(--green)' : 'var(--text-4)' }}>
                        {doneData?.foodRemaining != null ? fmt(doneData.foodRemaining) : '$—'}
                      </div>
                    </div>
                    {doneData?.foodRemaining == null && <div style={{ fontSize: '12px', color: 'var(--text-4)' }}>Set budgets on dashboard</div>}
                  </div>
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={advance}>
              Go to Dashboard →
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
