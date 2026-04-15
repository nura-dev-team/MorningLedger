import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// ── Enter Data screen ─────────────────────────────────────────────────────────
// Manual sales + labor entry + budget adjustment.
// Will be replaced by POS/7shifts integrations in Phase 2.

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

    const { error } = await supabase
      .from('gl_codes')
      .upsert(rows, { onConflict: 'property_id,code' })

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
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '6px' }}>
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--nt3)', fontSize: '14px', padding: 0 }}
        >
          ← Back
        </button>
        <div className="font-newsreader" style={{ fontSize: '18px', fontWeight: 400 }}>Enter Data</div>
        <div style={{ width: '40px' }} />
      </div>

      <div style={{ fontSize: '13px', color: 'var(--nt3)', marginBottom: '18px', lineHeight: '1.6' }}>
        Manually enter weekly sales, labor data, and monthly budgets. In Phase 2, POS and scheduling integrations will replace manual entry.
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
              border: '1px solid var(--nborder)',
              background: tab === t ? 'var(--nt)' : 'var(--nsurf)',
              color: tab === t ? 'white' : 'var(--nt3)',
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

      {/* ── Sales form ── */}
      {tab === 'sales' && (
        <form onSubmit={submitSales}>
          <div className="nura-card" style={{ marginBottom: '12px' }}>
            <Field label="Date"           type="date"   value={salesForm.date}           onChange={handleSalesChange('date')}           required />
            <Field label="Week number"    type="number" value={salesForm.week_number}    onChange={handleSalesChange('week_number')}    placeholder="e.g. 5" />
            <Field label="Food sales"     type="number" value={salesForm.food_sales}     onChange={handleSalesChange('food_sales')}     placeholder="e.g. 3200.00" />
            <Field label="Beverage sales" type="number" value={salesForm.beverage_sales} onChange={handleSalesChange('beverage_sales')} placeholder="e.g. 1400.00" />
            <Field label="Total sales"    type="number" value={salesForm.total_sales}    onChange={handleSalesChange('total_sales')}    placeholder="Auto-filled or enter manually" required />
          </div>

          {salesError   && <div style={{ fontSize: '13px', color: 'var(--red)',   marginBottom: '10px' }}>{salesError}</div>}
          {salesSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Sales entry saved.</div>}

          <button type="submit" className="btn-primary" disabled={savingSales}>
            {savingSales ? 'Saving…' : 'Save Sales Entry'}
          </button>
        </form>
      )}

      {/* ── Labor form ── */}
      {tab === 'labor' && (
        <form onSubmit={submitLabor}>
          <div className="nura-card" style={{ marginBottom: '12px' }}>
            <Field label="Period start" type="date"   value={laborForm.period_start} onChange={(e) => setLaborForm(f => ({ ...f, period_start: e.target.value }))} required />
            <Field label="Period end"   type="date"   value={laborForm.period_end}   onChange={(e) => setLaborForm(f => ({ ...f, period_end:   e.target.value }))} required />
            <Field label="Total labor"  type="number" value={laborForm.total_labor}  onChange={(e) => setLaborForm(f => ({ ...f, total_labor:  e.target.value }))} placeholder="e.g. 19053.00" required />
          </div>

          {laborError   && <div style={{ fontSize: '13px', color: 'var(--red)',   marginBottom: '10px' }}>{laborError}</div>}
          {laborSuccess && <div className="note-green" style={{ marginBottom: '10px' }}>✓ Labor entry saved.</div>}

          <button type="submit" className="btn-primary" disabled={savingLabor}>
            {savingLabor ? 'Saving…' : 'Save Labor Entry'}
          </button>
        </form>
      )}

      {/* ── Budgets form ── */}
      {tab === 'budgets' && (
        <form onSubmit={saveBudgets}>
          {loadingBudgets ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
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
                      borderBottom: i < glCodes.length - 1 ? '1px solid var(--nborder)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>{g.name}</div>
                      <span className="gl-pill">{g.code}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--nt3)' }}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={budgetEdits[g.id] ?? ''}
                        onChange={(e) => setBudgetEdits((prev) => ({ ...prev, [g.id]: e.target.value }))}
                        style={{
                          width: '90px',
                          border: '1px solid var(--nborder)',
                          borderRadius: '6px',
                          padding: '5px 8px',
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: '13px',
                          textAlign: 'right',
                          background: 'var(--nsurf)',
                          color: 'var(--nt)',
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
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--nt4)', fontSize: '13px' }}>Loading…</div>
          ) : (
            <>
              {/* Existing vendors list */}
              {vendors.length > 0 && (
                <div className="nura-card" style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '10px' }}>
                    Current Vendors
                  </div>
                  {vendors.map((v, i) => (
                    <div
                      key={v.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < vendors.length - 1 ? '1px solid var(--nborder)' : 'none',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>{v.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--nt4)' }}>
                          {v.default_gl_code && <span className="gl-pill">{v.default_gl_code}</span>}
                          {v.delivery_frequency && <span style={{ marginLeft: v.default_gl_code ? '6px' : 0 }}>{v.delivery_frequency}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: v.is_active ? 'var(--green)' : 'var(--nt4)' }}>
                        {v.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {vendors.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--nt4)', fontSize: '13px', marginBottom: '16px' }}>
                  No vendors yet. Add your first vendor below.
                </div>
              )}

              {/* Add Vendor form */}
              <form onSubmit={submitVendor}>
                <div className="nura-card" style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '10px' }}>
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
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)', marginBottom: '6px' }}>
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
                  <Field
                    label="Delivery frequency"
                    value={vendorForm.delivery_frequency}
                    onChange={(e) => setVendorForm((f) => ({ ...f, delivery_frequency: e.target.value }))}
                    placeholder="e.g. Weekly"
                  />
                  <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--nt4)' }}>
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => setVendorForm((f) => ({ ...f, is_active: !f.is_active }))}
                      style={{
                        width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                        background: vendorForm.is_active ? 'var(--green, #22c55e)' : 'var(--nborder)',
                        position: 'relative', transition: 'background 0.2s',
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '2px',
                        left: vendorForm.is_active ? '20px' : '2px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'white', transition: 'left 0.2s',
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
