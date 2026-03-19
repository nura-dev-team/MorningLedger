// ─── Currency formatters ───────────────────────────────────────────────────

/** $1,234 — no cents, for totals */
export const fmt = (n) => {
  if (n == null || isNaN(n)) return '$—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** $1,234.56 — with cents, for invoice amounts */
export const fmtFull = (n) => {
  if (n == null || isNaN(n)) return '$—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 184.4% */
export const fmtPct = (n, decimals = 1) => {
  if (n == null || isNaN(n)) return '—%'
  return n.toFixed(decimals) + '%'
}

// ─── Period helpers ────────────────────────────────────────────────────────

/** Returns ISO date strings for start/end of a given month */
export const getMonthRange = (year, month) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** "January 2026" */
export const fmtPeriodLabel = (year, month) => {
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** "Jan 29" from "2026-01-29" */
export const fmtDateShort = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Status signal helpers ─────────────────────────────────────────────────

/**
 * Returns the NURA status color key based on prime cost %
 * target is typically 62.0
 */
export const primeCostStatus = (pct, target = 62) => {
  if (pct > 100) return 'amber'   // ramp-up — elevated but explainable
  if (pct > target * 1.15) return 'orange'
  if (pct > target) return 'amber'
  return 'green'
}

/** Returns { label, className } for a budget utilization % */
export const budgetStatus = (utilPct, remaining) => {
  if (remaining < 0) return { label: 'Over',      cls: 'bdg-orange' }
  if (utilPct === 0) return { label: 'Untouched',  cls: 'bdg-blue' }
  if (utilPct >= 80) return { label: 'Watch',      cls: 'bdg-amber' }
  return              { label: 'Under',      cls: 'bdg-green' }
}

// ─── Narrative generators ──────────────────────────────────────────────────

export const getPrimeCostNarrative = ({ primeCostPct, totalLabor, totalSales, fbCogs }) => {
  if (!totalSales) return 'No sales data for this period yet.'

  const laborPct = totalSales > 0 ? (totalLabor / totalSales) * 100 : 0

  if (primeCostPct > 100) {
    return `Labor is fixed at ${fmt(totalLabor)} while revenue ramps. Every dollar of new sales compresses this number. Focus on driving covers.`
  }
  if (primeCostPct > 75) {
    return `Prime cost is elevated at ${fmtPct(primeCostPct)}. Labor at ${fmtPct(laborPct)} is the primary driver. Prioritize volume and control food orders.`
  }
  if (primeCostPct <= 62) {
    return `Prime cost is healthy at ${fmtPct(primeCostPct)} — running below the 62% target. Keep the discipline and protect the margin.`
  }
  return `Prime cost is at ${fmtPct(primeCostPct)}, slightly above the 62% target. Watch food orders and push for strong service this week.`
}

export const getInfluencePoints = ({ budgets = [], weeklySales = {} }) => {
  const points = []

  // Over-budget categories
  const over = budgets.filter((b) => b.remaining < 0)
  if (over.length > 0) {
    points.push(`${over[0].name} is $${Math.abs(over[0].remaining).toFixed(0)} over — pause non-essential orders`)
  }

  // Beverage health check
  const bevBudgets = budgets.filter((b) => ['liquor', 'wine', 'beer'].includes(b.category))
  const bevSpent = bevBudgets.reduce((s, b) => s + b.spent, 0)
  const bevBudget = bevBudgets.reduce((s, b) => s + b.monthly_budget, 0)
  if (bevBudget > 0) {
    const bevPct = (bevSpent / bevBudget) * 100
    if (bevPct < 50) {
      const actualBevPct = bevSpent / (bevBudgets.reduce((s, b) => s + b.spent, 0) || 1) // rough
      points.push(`Beverage cost is healthy — protect the margin and hold unnecessary orders`)
    }
  }

  // Latest week trend
  const weeks = Object.entries(weeklySales).sort((a, b) => Number(b[0]) - Number(a[0]))
  if (weeks.length >= 2) {
    const [latestWeek, latestAmt] = weeks[0]
    const [, prevAmt] = weeks[1]
    if (Number(latestAmt) > Number(prevAmt)) {
      points.push(`Week ${latestWeek} pace at ${fmt(Number(latestAmt))} is the strongest yet — maintain momentum through month end`)
    }
  } else if (weeks.length === 1) {
    const [latestWeek, latestAmt] = weeks[0]
    points.push(`Week ${latestWeek} running at ${fmt(Number(latestAmt))} — keep driving covers`)
  }

  return points
}
