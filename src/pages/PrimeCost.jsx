// ── PrimeCost screen ─────────────────────────────────────────────────────────
// Static SYN January 2026 data — real data fetching in Phase 2

const weeklyData = [
  { week: 'W1', revenue: 906,   pct: 13 },
  { week: 'W2', revenue: 1296,  pct: 23 },
  { week: 'W3', revenue: 1957,  pct: 35 },
  { week: 'W4', revenue: 3477,  pct: 62 },
  { week: 'W5', revenue: 5576,  pct: 100, current: true },
]

const PrimeCost = () => (
  <div className="screen">
    {/* ── Header ── */}
    <div className="screen-hdr">
      <div className="font-newsreader" style={{ fontSize: '22px', fontWeight: 400 }}>Prime Cost</div>
      <span className="bdg bdg-amber">Ramp-up</span>
    </div>

    {/* ── Big number card ── */}
    <div className="nura-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div className="stat-label">Prime Cost MTD</div>
      <div className="font-newsreader" style={{ fontSize: '66px', lineHeight: 1, color: 'var(--amber)', marginTop: '4px' }}>
        184.4%
      </div>
      <div style={{ fontSize: '13px', color: 'var(--nt3)', marginTop: '6px' }}>Target 62.0%</div>
    </div>

    {/* ── Breakdown card ── */}
    <div className="nura-card">
      <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '10px' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="stat-label">F&amp;B Cost</div>
          <div className="font-newsreader" style={{ fontSize: '26px' }}>40.2%</div>
          <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>$5,307</div>
        </div>
        <div style={{ textAlign: 'center', paddingTop: '12px', color: 'var(--nt4)', fontSize: '18px' }}>+</div>
        <div style={{ textAlign: 'center' }}>
          <div className="stat-label">Labor</div>
          <div className="font-newsreader" style={{ fontSize: '26px' }}>144.2%</div>
          <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>$19,053</div>
        </div>
        <div style={{ textAlign: 'center', paddingTop: '12px', color: 'var(--nt4)', fontSize: '18px' }}>=</div>
        <div style={{ textAlign: 'center' }}>
          <div className="stat-label">Combined</div>
          <div className="font-newsreader" style={{ fontSize: '26px', color: 'var(--amber)' }}>184.4%</div>
          <div style={{ fontSize: '11px', color: 'var(--nt3)' }}>$24,360</div>
        </div>
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', height: '8px', borderRadius: '6px', overflow: 'hidden', margin: '8px 0' }}>
        <div style={{ width: '21.8%', background: 'var(--green)' }} />
        <div style={{ width: '78.2%', background: 'var(--amber)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--green)' }} />
          <span style={{ fontSize: '11px', color: 'var(--nt3)' }}>F&amp;B</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--amber)' }} />
          <span style={{ fontSize: '11px', color: 'var(--nt3)' }}>Labor</span>
        </div>
      </div>
    </div>

    {/* ── Weekly revenue trend ── */}
    <div className="section-label">Weekly Revenue Trend</div>
    <div className="nura-csm">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '76px' }}>
        {weeklyData.map(({ week, revenue, pct, current }) => (
          <div key={week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <div style={{ fontSize: '10px', color: 'var(--nt2)', fontWeight: '500' }}>
              {revenue >= 1000 ? `$${(revenue/1000).toFixed(1)}k` : `$${revenue}`}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <div
                style={{
                  width: '100%',
                  height: `${pct}%`,
                  borderRadius: '3px 3px 0 0',
                  background: current ? 'var(--nt)' : 'var(--nsurf-alt)',
                }}
              />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--nt4)' }}>{week}{current ? ' ↑' : ''}</div>
          </div>
        ))}
      </div>
    </div>

    {/* ── What's driving this ── */}
    <div className="section-label">What's Driving This</div>
    <div className="nura-csm" style={{ marginBottom: '9px' }}>
      {[
        'Labor ($19,053) is fixed — doesn\'t move whether you serve 10 or 100 tables',
        'Revenue still in ramp-up — Week 5 at $5,576 is the strongest yet',
        'Food cost at 83.7% vs 30% target — ordering tightly matters now',
      ].map((point, i) => (
        <div key={i} className="infl">
          <div className="infl-dot" />
          <div>{point}</div>
        </div>
      ))}
    </div>

    {/* ── What you can still influence ── */}
    <div className="section-label">What You Can Still Influence</div>
    <div className="nura-csm">
      {[
        'Every dollar of revenue automatically compresses prime cost',
        'Beverage is healthy at 15.4% — protect it',
      ].map((point, i) => (
        <div key={i} className="infl">
          <div className="infl-dot" />
          <div>{point}</div>
        </div>
      ))}
    </div>
  </div>
)

export default PrimeCost
