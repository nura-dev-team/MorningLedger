import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtFull, fmtPct } from '../lib/utils'

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

const STEPS = ['welcome', 'property', 'role', 'gl', 'sales', 'labor', 'invoice', 'done']
const TOTAL_STEPS = 7 // welcome → invoice; done is the completion screen

const STEP_LABEL = {
  welcome:  'Welcome',
  property: 'Restaurant Setup',
  role:     'Your Role',
  gl:       'GL Codes & Budgets',
  sales:    'Last Week\'s Sales',
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

const ROLES = [
  { value: 'owner',      label: 'Owner / Operator',  desc: 'You own or operate the restaurant directly.' },
  { value: 'gm',         label: 'General Manager',   desc: 'You manage day-to-day restaurant operations.' },
  { value: 'controller', label: 'Controller / CFO',  desc: 'You manage finances across multiple properties.' },
  { value: 'viewer',     label: 'Viewer',             desc: 'Read-only access to financial data.' },
]

const DEFAULT_GL_CODES = [
  { code: '5217250', name: 'Food Purchases',     category: 'food',     monthly_budget: 7722, sort_order: 1 },
  { code: '5217257', name: 'Liquor',             category: 'liquor',   monthly_budget: 3533, sort_order: 2 },
  { code: '5217255', name: 'Wine',               category: 'wine',     monthly_budget: 2933, sort_order: 3 },
  { code: '5217258', name: 'Beer',               category: 'beer',     monthly_budget: 1786, sort_order: 4 },
  { code: '5217275', name: 'Operating Supplies', category: 'supplies', monthly_budget: 118,  sort_order: 5 },
  { code: '5217280', name: 'Uniforms',           category: 'uniforms', monthly_budget: 195,  sort_order: 6 },
]

const DEFAULT_VENDORS = [
  { name: 'Baldor',    default_gl_code: '5217250', delivery_frequency: 'Twice weekly' },
  { name: 'US Foods',  default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Keany',     default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Profish',   default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Breakthru', default_gl_code: '5217257', delivery_frequency: 'Weekly' },
  { name: 'Alsco',     default_gl_code: '5217275', delivery_frequency: 'Weekly' },
]

const PROCESSING_STEPS = ['Reading invoice…', 'Assigning GL code…', 'Checking budget…']

const today = new Date().toISOString().slice(0, 10)

// ── Label style reused across form fields ─────────────────────────────────────

const lbl = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  color: 'var(--nt4)',
  marginBottom: '6px',
}

const fieldWrap = { marginBottom: '14px' }

// ── Main component ────────────────────────────────────────────────────────────

const Onboarding = () => {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('welcome')
  const stepIdx = STEPS.indexOf(step)

  // Shared state persisted across steps
  const [createdProperty, setCreatedProperty] = useState(null) // { id, name, ... }
  const [selectedRole,    setSelectedRole]    = useState(null)
  const [budgets,         setBudgets]         = useState(DEFAULT_GL_CODES.map(g => ({ ...g })))

  // ── Step 2: Property ────────────────────────────────────────────────────────
  const [propForm,    setPropForm]    = useState({ name: '', timezone: 'America/New_York', prime_cost_target: '62.0' })
  const [propLoading, setPropLoading] = useState(false)
  const [propError,   setPropError]   = useState(null)

  // ── Step 3: Role ────────────────────────────────────────────────────────────
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleError,   setRoleError]   = useState(null)

  // ── Step 4: GL Codes ────────────────────────────────────────────────────────
  const [glLoading, setGlLoading] = useState(false)
  const [glError,   setGlError]   = useState(null)

  // ── Step 5: Sales ───────────────────────────────────────────────────────────
  const [salesForm,    setSalesForm]    = useState({ date: '', week_number: '', food_sales: '', beverage_sales: '', total_sales: '' })
  const [salesLoading, setSalesLoading] = useState(false)
  const [salesError,   setSalesError]   = useState(null)

  // ── Step 6: Labor ───────────────────────────────────────────────────────────
  const [laborForm,    setLaborForm]    = useState({ period_start: '', period_end: '', total_labor: '' })
  const [laborLoading, setLaborLoading] = useState(false)
  const [laborError,   setLaborError]   = useState(null)

  // ── Step 7: Invoice (inline) ────────────────────────────────────────────────
  const [vendors,       setVendors]       = useState([])
  const [glCodes,       setGlCodes]       = useState([])
  const [invForm,       setInvForm]       = useState({ vendor_id: '', invoice_number: '', invoice_date: today, amount: '', description: '', gl_code: '' })
  const [invProcessing, setInvProcessing] = useState(false)
  const [invAnimStep,   setInvAnimStep]   = useState(0)
  const [invResult,     setInvResult]     = useState(null) // { saved, budget, budgetRemaining }
  const [invError,      setInvError]      = useState(null)
  const [dupWarning,    setDupWarning]    = useState(false)

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

  // ── Load vendors + GL codes for invoice step ────────────────────────────────

  useEffect(() => {
    if (step !== 'invoice' || !createdProperty) return
    Promise.all([
      supabase
        .from('vendors')
        .select('id, name, default_gl_code')
        .eq('property_id', createdProperty.id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('gl_codes')
        .select('id, code, name, category')
        .eq('property_id', createdProperty.id)
        .eq('is_active', true)
        .order('sort_order'),
    ]).then(([vRes, gRes]) => {
      setVendors(vRes.data || [])
      setGlCodes(gRes.data  || [])
    })
  }, [step, createdProperty])

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
        prime_cost_target:  parseFloat(propForm.prime_cost_target) || 62.0,
      })
      .select()
      .single()

    if (propErr) { setPropError(propErr.message); setPropLoading(false); return }

    setCreatedProperty(newProp)

    // Link profile to the new property
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({ property_id: newProp.id })
      .eq('id', profile.id)

    setPropLoading(false)
    if (profileErr) { setPropError(profileErr.message); return }

    advance()
  }

  const handleRole = async () => {
    if (!selectedRole) return
    setRoleLoading(true)
    setRoleError(null)

    const { error } = await supabase
      .from('profiles')
      .update({ role: selectedRole })
      .eq('id', profile.id)

    setRoleLoading(false)
    if (error) { setRoleError(error.message); return }
    advance()
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

    const { error: glErr } = await supabase
      .from('gl_codes')
      .upsert(glRows, { onConflict: 'property_id,code' })

    if (glErr) { setGlError(glErr.message); setGlLoading(false); return }

    // Seed default vendors (insert; new property so no conflicts)
    const vendorRows = DEFAULT_VENDORS.map(v => ({
      property_id:       propertyId,
      name:              v.name,
      default_gl_code:   v.default_gl_code,
      delivery_frequency: v.delivery_frequency,
      is_active:         true,
    }))
    await supabase.from('vendors').insert(vendorRows)
    // Non-blocking — vendor seed failure shouldn't block the user

    setGlLoading(false)
    advance()
  }

  const handleSales = async (skip = false) => {
    if (skip) { advance(); return }
    if (!salesForm.date || !salesForm.total_sales) {
      setSalesError('Date and total sales are required.')
      return
    }
    setSalesLoading(true)
    setSalesError(null)

    const { error } = await supabase.from('sales_entries').upsert({
      property_id:    createdProperty.id,
      date:           salesForm.date,
      week_number:    parseInt(salesForm.week_number) || null,
      food_sales:     parseFloat(salesForm.food_sales)     || 0,
      beverage_sales: parseFloat(salesForm.beverage_sales) || 0,
      total_sales:    parseFloat(salesForm.total_sales),
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

  const handleVendorChange = (e) => {
    const vendorId = e.target.value
    const vendor   = vendors.find(v => v.id === vendorId)
    setInvForm(f => ({ ...f, vendor_id: vendorId, gl_code: vendor?.default_gl_code || f.gl_code }))
  }

  const checkDuplicate = async () => {
    if (!invForm.invoice_number || !invForm.vendor_id || !createdProperty) return
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', createdProperty.id)
      .eq('invoice_number', invForm.invoice_number)
      .eq('vendor_id', invForm.vendor_id)
    setDupWarning(count > 0)
  }

  const handleInvoiceSubmit = async () => {
    if (!invForm.vendor_id || !invForm.gl_code || !invForm.amount) return
    setInvError(null)
    setInvProcessing(true)
    setInvAnimStep(0)

    const t1 = setTimeout(() => setInvAnimStep(1), 800)
    const t2 = setTimeout(() => setInvAnimStep(2), 1600)

    const { data: saved, error } = await supabase
      .from('invoices')
      .insert({
        property_id:    createdProperty.id,
        vendor_id:      invForm.vendor_id,
        invoice_number: invForm.invoice_number || null,
        invoice_date:   invForm.invoice_date,
        amount:         parseFloat(invForm.amount),
        description:    invForm.description || null,
        gl_code:        invForm.gl_code,
        status:         'pending',
      })
      .select('*, vendors(name)')
      .single()

    clearTimeout(t1)
    clearTimeout(t2)

    if (error) {
      setInvProcessing(false)
      setInvError(error.message)
      return
    }

    setInvAnimStep(2)

    // Compute estimated budget remaining for the result card
    const budget         = budgets.find(b => b.code === invForm.gl_code)
    const budgetRemaining = budget ? Number(budget.monthly_budget) - parseFloat(invForm.amount) : null

    setTimeout(() => {
      setInvProcessing(false)
      setInvResult({ saved, budget, budgetRemaining })
    }, 600)
  }

  const handleInvoiceSkip = async () => {
    await refreshProfile()
    advance()
  }

  const handleInvoiceDone = async () => {
    await refreshProfile()
    advance()
  }

  const handleOpenNura = () => {
    const dest = selectedRole === 'controller' ? '/controller' : '/'
    navigate(dest, { replace: true })
  }

  // ── Sales form: auto-calc total ─────────────────────────────────────────────

  const handleSalesChange = (field) => (e) => {
    const val = e.target.value
    setSalesForm(prev => {
      const next = { ...prev, [field]: val }
      if ((field === 'food_sales' || field === 'beverage_sales') && next.food_sales && next.beverage_sales) {
        next.total_sales = (parseFloat(next.food_sales || 0) + parseFloat(next.beverage_sales || 0)).toFixed(2)
      }
      return next
    })
  }

  // ── Progress bar ────────────────────────────────────────────────────────────

  const stepNum   = stepIdx + 1 // 1-7 for welcome→invoice; 8 for done (unused)
  const showProg  = step !== 'done'
  const showBack  = stepIdx > 0 && step !== 'done'
  const progWidth = `${(stepNum / TOTAL_STEPS) * 100}%`

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--nbg)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 24px 60px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* ── Progress indicator ── */}
        {showProg && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--nt4)' }}>
                Step {stepNum} of {TOTAL_STEPS}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--nt4)' }}>{STEP_LABEL[step]}</div>
            </div>
            <div style={{ background: 'var(--nsurf-alt)', height: '3px', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: progWidth, background: 'var(--nt)', borderRadius: '2px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* ── Back button ── */}
        {showBack && (
          <button
            onClick={goBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt3)', fontSize: '14px', padding: '0 0 18px', display: 'block' }}
          >
            ← Back
          </button>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 1 — WELCOME
        ══════════════════════════════════════════════════ */}
        {step === 'welcome' && (
          <div style={{ textAlign: 'center', paddingTop: '24px' }}>
            <div
              className="font-newsreader"
              style={{ fontSize: '42px', letterSpacing: '6px', textTransform: 'uppercase', color: 'var(--nt)', marginBottom: '20px' }}
            >
              NURA
            </div>
            <div style={{ fontSize: '16px', color: 'var(--nt2)', marginBottom: '10px', lineHeight: '1.6' }}>
              Real-time financial clarity for hospitality.
            </div>
            <div style={{ fontSize: '13px', color: 'var(--nt4)', marginBottom: '40px', lineHeight: '1.7' }}>
              Set up your restaurant in 7 steps. By the time you finish, your dashboard will show real data — prime cost, budgets, and your first invoice coded.
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
            <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Three fields. This creates your restaurant's profile in NURA.
            </div>

            <div className="nura-card">
              <div style={fieldWrap}>
                <label style={lbl}>Restaurant name</label>
                <input
                  type="text"
                  className="nura-input"
                  placeholder="e.g. SYN"
                  value={propForm.name}
                  onChange={e => setPropForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div style={fieldWrap}>
                <label style={lbl}>Timezone</label>
                <select className="nura-select" value={propForm.timezone} onChange={e => setPropForm(f => ({ ...f, timezone: e.target.value }))}>
                  {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                </select>
              </div>

              <div>
                <label style={lbl}>Prime cost target (%)</label>
                <input
                  type="number"
                  className="nura-input"
                  placeholder="62.0"
                  step="0.1"
                  min="0"
                  max="200"
                  value={propForm.prime_cost_target}
                  onChange={e => setPropForm(f => ({ ...f, prime_cost_target: e.target.value }))}
                />
                <div style={{ fontSize: '12px', color: 'var(--nt4)', marginTop: '4px' }}>
                  Industry standard is 62%. Adjust for your operation.
                </div>
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
            STEP 3 — YOUR ROLE
        ══════════════════════════════════════════════════ */}
        {step === 'role' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Your role</div>
            <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: '1.6' }}>
              What best describes your role? This determines where NURA takes you after setup.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {ROLES.map(r => {
                const isSelected = selectedRole === r.value
                return (
                  <div
                    key={r.value}
                    onClick={() => setSelectedRole(r.value)}
                    style={{
                      background:    'var(--nsurf)',
                      border:        isSelected ? '2px solid var(--nt)' : '1px solid var(--nborder)',
                      borderRadius:  'var(--r)',
                      padding:       isSelected ? '15px' : '16px',
                      cursor:        'pointer',
                      display:       'flex',
                      alignItems:    'center',
                      justifyContent: 'space-between',
                      transition:    'border 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--nt)' }}>{r.label}</div>
                      <div style={{ fontSize: '12px', color: 'var(--nt3)', marginTop: '2px' }}>{r.desc}</div>
                    </div>
                    {isSelected && (
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: 'var(--nt)', flexShrink: 0, marginLeft: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', color: 'white',
                      }}>
                        ✓
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {roleError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{roleError}</div>}

            <button
              className="btn-primary"
              onClick={handleRole}
              disabled={roleLoading || !selectedRole}
            >
              {roleLoading ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 4 — GL CODES & BUDGETS
        ══════════════════════════════════════════════════ */}
        {step === 'gl' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>GL codes &amp; budgets</div>
            <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: '1.6' }}>
              These are your spending categories. Adjust the monthly budget for each one. We'll also add your 6 default vendors automatically.
            </div>

            <div className="nura-card" style={{ marginBottom: '14px' }}>
              {budgets.map((b, i) => (
                <div
                  key={b.code}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 0',
                    borderBottom: i < budgets.length - 1 ? '1px solid var(--nborder)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{b.name}</div>
                    <span className="gl-pill">{b.code}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--nt3)' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={b.monthly_budget}
                      onChange={e => {
                        const val = parseFloat(e.target.value) || 0
                        setBudgets(prev => prev.map((x, j) => j === i ? { ...x, monthly_budget: val } : x))
                      }}
                      style={{
                        width: '90px', border: '1px solid var(--nborder)', borderRadius: '6px',
                        padding: '5px 8px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
                        textAlign: 'right', background: 'var(--nsurf)', color: 'var(--nt)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {glError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{glError}</div>}

            <button className="btn-primary" onClick={handleGl} disabled={glLoading}>
              {glLoading ? 'Saving…' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 5 — LAST WEEK'S SALES
        ══════════════════════════════════════════════════ */}
        {step === 'sales' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Last week's sales</div>
            <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '12px', lineHeight: '1.6' }}>
              Enter last week's sales so your dashboard shows real numbers right away. You can update this anytime.
            </div>

            <div
              style={{
                background: 'var(--amber-bg)', borderLeft: '3px solid var(--amber)',
                borderRadius: '0 var(--r-sm) var(--r-sm) 0', padding: '10px 13px',
                fontSize: '13px', color: 'var(--amber)', lineHeight: '1.55', marginBottom: '16px',
              }}
            >
              Skip this and your dashboard starts blank. Enter at least a total to see your prime cost immediately.
            </div>

            <div className="nura-card" style={{ marginBottom: '12px' }}>
              <div style={fieldWrap}>
                <label style={lbl}>Week ending date</label>
                <input type="date" className="nura-input" value={salesForm.date} onChange={handleSalesChange('date')} />
              </div>
              <div style={fieldWrap}>
                <label style={lbl}>Food sales ($)</label>
                <input type="number" className="nura-input" placeholder="e.g. 3200.00" value={salesForm.food_sales} onChange={handleSalesChange('food_sales')} />
              </div>
              <div style={fieldWrap}>
                <label style={lbl}>Beverage sales ($)</label>
                <input type="number" className="nura-input" placeholder="e.g. 1400.00" value={salesForm.beverage_sales} onChange={handleSalesChange('beverage_sales')} />
              </div>
              <div>
                <label style={lbl}>Total sales ($)</label>
                <input type="number" className="nura-input" placeholder="Auto-filled from food + bev" value={salesForm.total_sales} onChange={handleSalesChange('total_sales')} />
              </div>
            </div>

            {salesError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{salesError}</div>}

            <button
              className="btn-primary"
              onClick={() => handleSales(false)}
              disabled={salesLoading}
              style={{ marginBottom: '10px' }}
            >
              {salesLoading ? 'Saving…' : 'Save & Continue →'}
            </button>
            <button
              onClick={() => handleSales(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt4)', fontSize: '13px', display: 'block', textAlign: 'center', width: '100%', padding: '8px 0' }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 6 — LABOR COST
        ══════════════════════════════════════════════════ */}
        {step === 'labor' && (
          <div>
            <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>Labor cost</div>
            <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: '1.6' }}>
              Your total labor cost for the current period. This is the biggest driver of prime cost.
            </div>

            <div className="nura-card" style={{ marginBottom: '12px' }}>
              <div style={fieldWrap}>
                <label style={lbl}>Period start</label>
                <input type="date" className="nura-input" value={laborForm.period_start} onChange={e => setLaborForm(f => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div style={fieldWrap}>
                <label style={lbl}>Period end</label>
                <input type="date" className="nura-input" value={laborForm.period_end} onChange={e => setLaborForm(f => ({ ...f, period_end: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Total labor cost ($)</label>
                <input type="number" className="nura-input" placeholder="e.g. 19053.00" value={laborForm.total_labor} onChange={e => setLaborForm(f => ({ ...f, total_labor: e.target.value }))} />
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
            <button
              onClick={() => handleLabor(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt4)', fontSize: '13px', display: 'block', textAlign: 'center', width: '100%', padding: '8px 0' }}
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 7 — FIRST INVOICE (INLINE)
        ══════════════════════════════════════════════════ */}
        {step === 'invoice' && (
          <div>
            {invProcessing ? (
              /* ── Processing animation ── */
              <div style={{ paddingTop: '20px' }}>
                <div className="font-newsreader" style={{ fontSize: '24px', marginBottom: '28px', textAlign: 'center' }}>
                  Processing invoice…
                </div>
                {PROCESSING_STEPS.map((label, i) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', padding: '11px 0',
                      opacity: i <= invAnimStep ? 1 : 0.3,
                      transition: 'opacity 0.4s',
                    }}
                  >
                    <div style={{
                      width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                      background: i < invAnimStep ? 'var(--green)' : i === invAnimStep ? 'var(--amber)' : 'var(--nborder)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', color: 'white', transition: 'background 0.4s',
                    }}>
                      {i < invAnimStep ? '✓' : i + 1}
                    </div>
                    <span style={{ fontSize: '15px', color: i <= invAnimStep ? 'var(--nt)' : 'var(--nt4)' }}>
                      {label}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: '24px', background: 'var(--nsurf-alt)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${((invAnimStep + 1) / 3) * 100}%`,
                    background: 'var(--amber)',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>

            ) : invResult ? (
              /* ── Invoice result ── */
              <div>
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                  <div style={{ fontSize: '42px', marginBottom: '12px' }}>✓</div>
                  <div className="font-newsreader" style={{ fontSize: '26px', marginBottom: '8px' }}>Invoice coded</div>
                  <div style={{ fontSize: '13px', color: 'var(--nt3)' }}>
                    {invResult.saved.vendors?.name} · {fmtFull(Number(invResult.saved.amount))} · <span className="gl-pill">{invResult.saved.gl_code}</span>
                  </div>
                </div>

                {invResult.budget && invResult.budgetRemaining !== null && (
                  <div className="nura-card" style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--nt4)', marginBottom: '10px' }}>
                      {invResult.budget.name} — budget updated
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '13px', color: 'var(--nt3)' }}>Remaining after this invoice</span>
                      <span
                        className="font-newsreader"
                        style={{ fontSize: '24px', color: invResult.budgetRemaining >= 0 ? 'var(--green)' : 'var(--orange)' }}
                      >
                        {invResult.budgetRemaining < 0 ? `-${fmtFull(Math.abs(invResult.budgetRemaining))}` : fmtFull(invResult.budgetRemaining)}
                      </span>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      <span className="bdg bdg-amber">Pending approval</span>
                    </div>
                  </div>
                )}

                <button className="btn-primary" onClick={handleInvoiceDone}>
                  Continue →
                </button>
              </div>

            ) : (
              /* ── Invoice form ── */
              <div>
                <div className="font-newsreader" style={{ fontSize: '28px', marginBottom: '6px' }}>First invoice</div>
                <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '20px', lineHeight: '1.6' }}>
                  Upload your most recent invoice. Watch NURA code it automatically and update your budget in real time.
                </div>

                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  <div style={fieldWrap}>
                    <label style={lbl}>Vendor</label>
                    <select className="nura-select" value={invForm.vendor_id} onChange={handleVendorChange}>
                      <option value="">Select vendor…</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>

                  <div style={fieldWrap}>
                    <label style={lbl}>GL Code</label>
                    <select className="nura-select" value={invForm.gl_code} onChange={e => setInvForm(f => ({ ...f, gl_code: e.target.value }))}>
                      <option value="">Select GL code…</option>
                      {glCodes.map(g => <option key={g.id} value={g.code}>{g.code} — {g.name}</option>)}
                    </select>
                  </div>

                  <div style={fieldWrap}>
                    <label style={lbl}>Invoice number</label>
                    <input
                      type="text"
                      className="nura-input"
                      placeholder="e.g. BA-20260129-001"
                      value={invForm.invoice_number}
                      onChange={e => { setInvForm(f => ({ ...f, invoice_number: e.target.value })); setDupWarning(false) }}
                      onBlur={checkDuplicate}
                    />
                    {dupWarning && <div style={{ fontSize: '12px', color: 'var(--orange)', marginTop: '4px' }}>⚠ Invoice number already exists for this vendor.</div>}
                  </div>

                  <div style={fieldWrap}>
                    <label style={lbl}>Invoice date</label>
                    <input type="date" className="nura-input" value={invForm.invoice_date} onChange={e => setInvForm(f => ({ ...f, invoice_date: e.target.value }))} />
                  </div>

                  <div style={fieldWrap}>
                    <label style={lbl}>Amount ($)</label>
                    <input type="number" step="0.01" min="0" className="nura-input" placeholder="e.g. 380.13" value={invForm.amount} onChange={e => setInvForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>

                  <div>
                    <label style={lbl}>Description</label>
                    <input type="text" className="nura-input" placeholder="e.g. Food / meats" value={invForm.description} onChange={e => setInvForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>

                {invError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{invError}</div>}

                <button
                  className="btn-primary"
                  onClick={handleInvoiceSubmit}
                  disabled={!invForm.vendor_id || !invForm.gl_code || !invForm.amount}
                  style={{ marginBottom: '10px' }}
                >
                  Submit Invoice
                </button>
                <button
                  onClick={handleInvoiceSkip}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt4)', fontSize: '13px', display: 'block', textAlign: 'center', width: '100%', padding: '8px 0' }}
                >
                  Skip for now — I'll add invoices from the Approvals screen
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            DONE — LIVE DASHBOARD SNAPSHOT
        ══════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '16px' }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>✓</div>
            <div className="font-newsreader" style={{ fontSize: '30px', marginBottom: '8px' }}>
              {createdProperty?.name || 'Your restaurant'} is live on NURA.
            </div>
            <div style={{ fontSize: '14px', color: 'var(--nt3)', marginBottom: '28px' }}>
              Here's where you stand today.
            </div>

            {doneLoading ? (
              <div style={{ padding: '24px', color: 'var(--nt4)', fontSize: '13px' }}>Loading your data…</div>
            ) : (
              <div className="stat-grid" style={{ marginBottom: '28px', textAlign: 'left' }}>
                <div className="stat-cell">
                  <div className="stat-label">Prime Cost</div>
                  <div
                    className="stat-val font-newsreader"
                    style={{ color: doneData?.primeCostPct != null ? 'var(--amber)' : 'var(--nt4)' }}
                  >
                    {doneData?.primeCostPct != null ? fmtPct(doneData.primeCostPct) : '—'}
                  </div>
                  {doneData?.primeCostPct == null && (
                    <div className="stat-sub">Add sales &amp; labor</div>
                  )}
                </div>

                <div className="stat-cell">
                  <div className="stat-label">Sales MTD</div>
                  <div className="stat-val font-newsreader" style={{ color: doneData?.totalSales != null ? 'var(--nt)' : 'var(--nt4)' }}>
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
                    style={{ color: doneData?.foodRemaining != null ? ((doneData.foodRemaining >= 0) ? 'var(--green)' : 'var(--orange)') : 'var(--nt4)' }}
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

            <button className="btn-primary" onClick={handleOpenNura}>
              Open NURA →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

export default Onboarding
