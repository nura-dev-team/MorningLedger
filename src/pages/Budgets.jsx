import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { fmt, getMonthRange, budgetStatus } from '../lib/utils'

// ── Budgets screen ────────────────────────────────────────────────────────────
// Queries gl_codes for budget targets and approved invoices for the current month.

const BudgetCard = ({ name, code, budget, spent, remaining, utilPct }) => {
  const noBudgetSet = budget === 0 && spent === 0
  const budgetSetNoSpend = budget > 0 && spent === 0

  // Ghost state — no budget target set at all
  if (noBudgetSet) {
    return (
      <div className="nura-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '500' }}>{name}</div>
            {code && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>GL {code}</div>}
          </div>
        </div>
        <div className="pbar-wrap">
          <div className="ghost" style={{ width: '100%', height: '100%', borderRadius: 'inherit' }} />
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-4)', marginTop: '3px' }}>
          Budget target not set{' '}
          <Link to="/settings/data" style={{ color: 'var(--amber)', fontSize: '12px', textDecoration: 'none', fontWeight: '500' }}>
            Set budget →
          </Link>
        </div>
      </div>
    )
  }

  // Budget set but zero spend — untouched
  if (budgetSetNoSpend) {
    return (
      <div className="nura-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '500' }}>{name}</div>
            {code && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>GL {code}</div>}
          </div>
          <span className="bdg bdg-blue">Untouched</span>
        </div>
        <div className="pbar-wrap">
          {/* Empty track visible, no fill */}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-4)' }}>$0 spent</span>
          <span style={{ fontSize: '13px', color: 'var(--green)' }}>{fmt(budget)} left</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--amber)', marginTop: '2px' }}>
          of {fmt(budget)} budgeted
        </div>
      </div>
    )
  }

  // Normal state — has real data
  const { label: badgeLbl, cls: badgeCls } = budgetStatus(utilPct, remaining)
  const over = remaining < 0
  const barCls = over ? 'pbar-fill pbar-orange' : 'pbar-fill pbar-green'
  const barWidth = `${Math.min(utilPct, 100)}%`

  return (
    <div
      className="nura-card"
      style={over ? { borderColor: 'var(--orange)' } : {}}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '500' }}>{name}</div>
          {code && <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>GL {code}</div>}
        </div>
        <span className={`bdg ${badgeCls}`}>{badgeLbl}</span>
      </div>

      <div className="pbar-wrap">
        <div className={barCls} style={{ width: barWidth }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>{fmt(spent)} spent</span>
        <span
          style={{
            fontSize: '13px',
            color: over ? 'var(--orange)' : 'var(--green)',
          }}
        >
          {over ? `-${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} left`}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-4)', marginTop: '2px' }}>
        of {fmt(budget)} · {utilPct.toFixed(1)}% used
      </div>
    </div>
  )
}

const Budgets = () => {
  const { activePropertyId, periodYear: year, periodMonth: month } = useAuth()
  const propertyId = activePropertyId

  const [budgets, setBudgets]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  // Add category state
  const [showAddCat, setShowAddCat]   = useState(false)
  const [newCatName, setNewCatName]   = useState('')
  const [newCatBudget, setNewCatBudget] = useState('')
  const [addingCat, setAddingCat]     = useState(false)
  const [addCatError, setAddCatError] = useState(null)

  const handleAddCategory = async () => {
    if (!newCatName.trim() || !propertyId) return
    setAddingCat(true)
    setAddCatError(null)

    const maxSort = budgets.length > 0 ? Math.max(...budgets.map((_, i) => i + 1)) : 0

    const { error: err } = await supabase.from('gl_codes').insert({
      property_id:    propertyId,
      code:           newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name:           newCatName.trim(),
      category:       newCatName.trim().toLowerCase(),
      monthly_budget: parseFloat(newCatBudget) || 0,
      sort_order:     maxSort + 1,
      is_active:      true,
    })

    setAddingCat(false)
    if (err) { setAddCatError(err.message); return }

    setNewCatName('')
    setNewCatBudget('')
    setShowAddCat(false)
    fetchData()
  }

  const fetchData = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)

    const { start, end } = getMonthRange(year, month)

    const [glRes, invRes] = await Promise.all([
      supabase
        .from('gl_codes')
        .select('code, name, monthly_budget')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .order('sort_order'),

      supabase
        .from('invoices')
        .select('gl_code, amount')
        .eq('property_id', propertyId)
        .eq('status', 'approved')
        .gte('invoice_date', start)
        .lte('invoice_date', end),
    ])

    if (glRes.error) { setError(glRes.error.message); setLoading(false); return }

    const glCodes = glRes.data || []
    const invoices = invRes.data || []

    // Spend per GL code
    const spend = {}
    for (const inv of invoices) {
      spend[inv.gl_code] = (spend[inv.gl_code] || 0) + Number(inv.amount)
    }

    const computed = glCodes.map((gl) => {
      const budget = Number(gl.monthly_budget)
      const spent = spend[gl.code] || 0
      const remaining = budget - spent
      const utilPct = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0)
      return {
        name: gl.name,
        code: gl.code,
        budget,
        spent,
        remaining,
        utilPct,
      }
    })

    setBudgets(computed)
    setLoading(false)
  }, [propertyId, year, month])

  useEffect(() => { fetchData() }, [fetchData])

  const overCount = budgets.filter((b) => b.remaining < 0).length

  // Generate summary note for over-budget categories
  const overCategories = budgets.filter((b) => b.remaining < 0)
  const untouchedCategories = budgets.filter((b) => b.spent === 0)

  let summaryNote = ''
  if (overCategories.length > 0) {
    const overNames = overCategories.map((b) => `${b.name} is ${fmt(Math.abs(b.remaining))} over budget`).join('. ')
    const otherInfo = []
    const underCount = budgets.length - overCategories.length - untouchedCategories.length
    if (underCount > 0) otherInfo.push(`${underCount === budgets.length - overCategories.length ? 'All other categories are' : `${underCount} categories are`} under`)
    if (untouchedCategories.length > 0) otherInfo.push(`${untouchedCategories.map((b) => b.name).join(', ')} ${untouchedCategories.length === 1 ? 'is' : 'are'} untouched`)
    summaryNote = overNames + '. ' + otherInfo.join('. ') + '.'
  }

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Budgets</div>
        {!loading && (
          <span className={overCount > 0 ? 'bdg bdg-orange' : 'bdg bdg-green'}>
            {overCount > 0 ? `${overCount} Over` : 'All Under'}
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--red-bg)', borderRadius: 'var(--r-sm)', fontSize: '13px', color: 'var(--red)', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-4)', fontSize: '13px' }}>Loading…</div>
      ) : (
        <>
          {/* ── Summary note ── */}
          {overCount > 0 && (
            <div className="note-orange">{summaryNote}</div>
          )}

          {/* ── Budget cards ── */}
          {budgets.length === 0 ? (
            <div className="nura-card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)', fontSize: '14px' }}>
              No budget categories configured yet. Add one below.
            </div>
          ) : (
            budgets.map((b, i) => <BudgetCard key={b.code || `gl-${i}`} {...b} />)
          )}

          {/* ── Add category ── */}
          {!showAddCat ? (
            <button
              onClick={() => setShowAddCat(true)}
              style={{
                display: 'block', width: '100%', marginTop: '12px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', padding: '14px',
                cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                color: 'var(--text)', fontFamily: "'DM Sans', sans-serif", textAlign: 'center',
                transition: 'border-color 0.15s',
              }}
            >
              + Add Category
            </button>
          ) : (
            <div className="nura-card" style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '10px' }}>
                New Category
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                  Category name
                </label>
                <input
                  type="text"
                  className="nura-input"
                  placeholder="e.g. Paper Goods, Cleaning"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory() } }}
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-4)', marginBottom: '8px' }}>
                  Monthly budget ($)
                </label>
                <input
                  type="number"
                  className="nura-input"
                  placeholder="Optional — set later if you're not sure"
                  min="0"
                  value={newCatBudget}
                  onChange={e => setNewCatBudget(e.target.value)}
                />
              </div>

              {addCatError && <div style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{addCatError}</div>}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={handleAddCategory} disabled={addingCat || !newCatName.trim()}>
                  {addingCat ? 'Adding…' : 'Add Category'}
                </button>
                <button
                  onClick={() => { setShowAddCat(false); setNewCatName(''); setNewCatBudget(''); setAddCatError(null) }}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                    padding: '10px 16px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-3)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Budgets
