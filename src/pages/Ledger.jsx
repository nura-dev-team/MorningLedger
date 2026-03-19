import { useState } from 'react'

// ── Ledger screen ─────────────────────────────────────────────────────────────
// Static SYN January 2026 data — real data fetching in Phase 2

const INVOICES = [
  { date: 'Jan 29', vendor: 'Breakthru',  desc: 'Liquor',                   amount: 542.31, gl: '5217257' },
  { date: 'Jan 29', vendor: 'Baldor',     desc: 'Food / meats',              amount: 380.13, gl: '5217250' },
  { date: 'Jan 24', vendor: 'Profish',    desc: 'Seafood',                   amount: 327.20, gl: '5217250' },
  { date: 'Jan 23', vendor: 'Baldor',     desc: 'Food',                      amount: 432.00, gl: '5217250' },
  { date: 'Jan 23', vendor: 'Breakthru',  desc: 'Liquor',                    amount: 410.55, gl: '5217257' },
  { date: 'Jan 23', vendor: 'Breakthru',  desc: 'Wine',                      amount: 126.93, gl: '5217255' },
  { date: 'Jan 22', vendor: 'Baldor',     desc: 'Cheese / garnishes',        amount: 163.28, gl: '5217250' },
  { date: 'Jan 22', vendor: 'Alsco',      desc: 'Operating supplies',        amount: 64.12,  gl: '5217275' },
  { date: 'Jan 15', vendor: 'US Foods',   desc: 'Dry grocery / poultry',     amount: 312.34, gl: '5217250' },
  { date: 'Jan 15', vendor: 'Profish',    desc: 'Seafood',                   amount: 254.87, gl: '5217250' },
  { date: 'Jan 13', vendor: 'US Foods',   desc: 'Meat',                      amount: 283.07, gl: '5217250' },
  { date: 'Jan 8',  vendor: 'Baldor',     desc: 'Meat / proteins',           amount: 317.32, gl: '5217250' },
  { date: 'Jan 8',  vendor: 'Breakthru',  desc: 'Liquor',                    amount: 217.14, gl: '5217257' },
  { date: 'Jan 6',  vendor: 'Keany',      desc: 'Produce / veggies',         amount: 564.35, gl: '5217250' },
  { date: 'Jan 6',  vendor: 'US Foods',   desc: 'Meat / garnishes',          amount: 406.63, gl: '5217250' },
  { date: 'Jan 6',  vendor: 'Baldor',     desc: 'Sauce / rice / cheese',     amount: 245.47, gl: '5217250' },
  { date: 'Jan 6',  vendor: 'Profish',    desc: 'Seafood',                   amount: 323.41, gl: '5217250' },
  { date: 'Jan 6',  vendor: 'Alsco',      desc: 'Operating supplies',        amount: 164.88, gl: '5217275' },
  { date: 'Jan 6',  vendor: 'Alsco',      desc: 'Uniforms',                  amount: 35.00,  gl: '5217280' },
]

const VENDORS = [
  { name: 'Baldor',    glCode: '5217250', category: 'Food',              frequency: 'Twice weekly', active: true },
  { name: 'US Foods',  glCode: '5217250', category: 'Food',              frequency: 'Weekly',       active: true },
  { name: 'Breakthru', glCode: '5217257', category: 'Liquor / Wine',     frequency: 'Weekly',       active: true },
  { name: 'Profish',   glCode: '5217250', category: 'Seafood',           frequency: 'Weekly',       active: true },
  { name: 'Keany',     glCode: '5217250', category: 'Produce',           frequency: 'Weekly',       active: true },
  { name: 'Alsco',     glCode: '5217275', category: 'Op. Supplies',      frequency: 'Weekly',       active: true },
]

const total   = INVOICES.reduce((s, i) => s + i.amount, 0)
const fmtFull = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const fmt     = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })

const Ledger = () => {
  const [tab, setTab] = useState('invoices')

  return (
    <div className="screen">
      {/* ── Header ── */}
      <div className="screen-hdr">
        <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Ledger</div>
        <span className="bdg bdg-green">$0 Variance</span>
      </div>

      {/* ── Summary stats ── */}
      <div className="stat-grid">
        <div className="stat-cell">
          <div className="stat-label">Invoices</div>
          <div className="stat-val">{INVOICES.length}</div>
          <div className="stat-sub">Jan 2026</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Total Spend</div>
          <div className="stat-val">{fmt(total)}</div>
          <div className="stat-sub">All coded</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Audit Variance</div>
          <div className="stat-val" style={{ color: 'var(--green)' }}>$0.00</div>
          <div className="stat-sub">Clean</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Active Vendors</div>
          <div className="stat-val">{VENDORS.length}</div>
          <div className="stat-sub">All active</div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {['invoices', 'vendors'].map((t) => (
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
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            {t === 'invoices' ? 'Invoices' : 'Vendors'}
          </button>
        ))}
      </div>

      {/* ── Invoices tab ── */}
      {tab === 'invoices' && (
        <div className="nura-csm">
          {INVOICES.map((inv, i) => (
            <div key={i} className="txr">
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>{inv.vendor}</div>
                <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
                  {inv.desc} · {inv.date}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: '600', fontSize: '14px' }}>{fmtFull(inv.amount)}</div>
                <span className="gl-pill">{inv.gl}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Vendors tab ── */}
      {tab === 'vendors' && (
        <div className="nura-csm">
          {VENDORS.map((v, i) => (
            <div key={i} className="txr">
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>{v.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--nt3)' }}>
                  {v.category} · {v.frequency}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="gl-pill">{v.glCode}</span>
                <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--green)' }}>Active</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Ledger
