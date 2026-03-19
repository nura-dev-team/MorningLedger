// ── Budgets screen ────────────────────────────────────────────────────────────
// Static SYN January 2026 data — real data fetching in Phase 2

const budgets = [
  { name: 'Food Purchases', code: '5217250', budget: 7722,  spent: 4010, remaining: 3712,  utilPct: 51.9, status: 'under' },
  { name: 'Liquor',         code: '5217257', budget: 3533,  spent: 1170, remaining: 2363,  utilPct: 33.1, status: 'under' },
  { name: 'Wine',           code: '5217255', budget: 2933,  spent: 127,  remaining: 2806,  utilPct: 4.3,  status: 'under' },
  { name: 'Beer',           code: '5217258', budget: 1786,  spent: 0,    remaining: 1786,  utilPct: 0,    status: 'untouched' },
  { name: 'Operating Supplies', code: '5217275', budget: 118, spent: 229, remaining: -111, utilPct: 100,  status: 'over' },
  { name: 'Uniforms',       code: '5217280', budget: 195,   spent: 35,   remaining: 160,   utilPct: 17.9, status: 'under' },
]

const fmt  = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const BudgetCard = ({ name, code, budget, spent, remaining, utilPct, status }) => {
  const over      = status === 'over'
  const untouched = status === 'untouched'

  const badgeCls  = over ? 'bdg bdg-orange' : untouched ? 'bdg bdg-blue' : 'bdg bdg-green'
  const badgeLbl  = over ? 'Over' : untouched ? 'Untouched' : 'Under'
  const barCls    = over ? 'pbar-fill pbar-orange' : 'pbar-fill pbar-green'
  const barWidth  = `${Math.min(utilPct, 100)}%`

  return (
    <div
      className="nura-card"
      style={over ? { borderColor: 'var(--orange)' } : {}}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: '500' }}>{name}</div>
          <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>GL {code}</div>
        </div>
        <span className={badgeCls}>{badgeLbl}</span>
      </div>

      <div className="pbar-wrap">
        <div className={barCls} style={{ width: barWidth }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
        <span style={{ fontSize: '13px', color: 'var(--nt3)' }}>{fmt(spent)} spent</span>
        <span
          style={{
            fontSize: '13px',
            color: over ? 'var(--orange)' : 'var(--green)',
          }}
        >
          {over ? `-${fmt(Math.abs(remaining))} over` : `${fmt(remaining)} left`}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--nt4)', marginTop: '2px' }}>
        of {fmt(budget)} · {utilPct.toFixed(1)}% used
      </div>
    </div>
  )
}

const Budgets = () => {
  const overCount = budgets.filter((b) => b.status === 'over').length

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Budgets</div>
        <span className={overCount > 0 ? 'bdg bdg-orange' : 'bdg bdg-green'}>
          {overCount > 0 ? `${overCount} Over` : 'All Under'}
        </span>
      </div>

      {/* ── Summary note ── */}
      {overCount > 0 && (
        <div className="note-orange">
          Operating Supplies is $111 over budget. All other categories are under. Beer is untouched.
        </div>
      )}

      {/* ── Budget cards ── */}
      {budgets.map((b) => (
        <BudgetCard key={b.code} {...b} />
      ))}
    </div>
  )
}

export default Budgets
