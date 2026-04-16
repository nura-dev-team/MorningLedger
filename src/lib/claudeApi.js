// ── NURA — Anthropic Claude API helpers ──────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

// ── Narrative generation (Home dashboard) ────────────────────────────────────
// Returns { statusPill, predictiveAlert, explainBlock }
// Cached by a hash of the numbers so repeated renders don't re-call.

const MAX_CACHE_SIZE = 20

function boundedSet(cache, key, value) {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry
    const first = cache.keys().next().value
    cache.delete(first)
  }
  cache.set(key, value)
}

const narrativeCache = new Map()

function hashNumbers(obj) {
  return JSON.stringify(obj)
}

const NARRATIVE_SYSTEM = `You are a hospitality financial advisor embedded in NURA, a real-time financial operating system for restaurant operators. You speak directly to the operator — concise, grounded, no fluff. Use actual numbers. Never use emojis. Keep every response under 2 sentences.`

export async function generateDashboardNarrative({
  primeCostPct,
  primeCostTarget,
  totalSales,
  totalLabor,
  fbCogs,
  foodBudgetRemaining,
  foodBudgetTotal,
  laborPct,
  fbCogsPct,
  weeklyTrend,     // e.g. "W1:$906, W2:$1296, W3:$1957, W4:$3477, W5:$5576"
  pendingCount,
  foodSpent,
  foodSales,
  bevSpent,
  bevSales,
}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  const cacheKey = hashNumbers({ primeCostPct, totalSales, totalLabor, fbCogs, foodBudgetRemaining, pendingCount })
  if (narrativeCache.has(cacheKey)) return narrativeCache.get(cacheKey)

  const dataBlock = [
    `Prime cost MTD: ${primeCostPct?.toFixed(1)}% (target: ${primeCostTarget}%)`,
    `Sales MTD: $${totalSales?.toLocaleString()}`,
    `F&B COGS: $${fbCogs?.toLocaleString()} (${fbCogsPct?.toFixed(1)}% of sales)`,
    `Labor: $${totalLabor?.toLocaleString()} (${laborPct?.toFixed(1)}% of sales)`,
    `Food budget: $${foodSpent?.toLocaleString()} spent of $${foodBudgetTotal?.toLocaleString()} ($${foodBudgetRemaining?.toLocaleString()} remaining)`,
    `Food cost vs food sales: ${foodSales > 0 ? ((foodSpent / foodSales) * 100).toFixed(1) : '—'}%`,
    `Beverage cost vs bev sales: ${bevSales > 0 ? ((bevSpent / bevSales) * 100).toFixed(1) : '—'}%`,
    `Weekly revenue trend: ${weeklyTrend}`,
    `Pending invoices: ${pendingCount}`,
  ].join('\n')

  const userPrompt = `Here is today's financial snapshot for this restaurant:\n\n${dataBlock}\n\nGenerate exactly 3 lines of JSON (no markdown, no backticks) with these keys:\n- "statusPill": 1–2 sentence status summary. Start with whether prime cost is healthy, elevated, or critical and why. Mention what is controllable.\n- "predictiveAlert": 1 sentence forward-looking prediction about budget runway or revenue trajectory based on the weekly trend.\n- "explainBlock": 1–2 sentence actionable insight about remaining budget, untapped categories, or revenue momentum.\n\nReturn only valid JSON.`

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: NARRATIVE_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      console.error('Narrative API error:', res.status)
      return null
    }

    const body = await res.json()
    let raw = body.content?.[0]?.text || ''
    raw = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

    const parsed = JSON.parse(raw)
    boundedSet(narrativeCache, cacheKey, parsed)
    return parsed
  } catch (err) {
    console.error('Narrative generation failed:', err)
    return null
  }
}

// ── Invoice budget impact insight ─────────────────────────────────────────────
// Returns a single sentence string or null.

const impactCache = new Map()

const IMPACT_SYSTEM = `You are a hospitality financial advisor embedded in NURA. You tell the operator what an invoice means for their budget in plain language. One sentence only. Never use filler or encouragement — only say something if it actually matters. If the numbers are fine, say so in under 10 words. No emojis.`

export async function generateBudgetImpactInsight({ amount, glCode, glName, budgetRemaining, budgetTotal, salesMtd }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  const cacheKey = hashNumbers({ amount, glCode, budgetRemaining, salesMtd })
  if (impactCache.has(cacheKey)) return impactCache.get(cacheKey)

  const afterRemaining = budgetRemaining - amount
  const utilPct = budgetTotal > 0 ? (((budgetTotal - budgetRemaining) + amount) / budgetTotal * 100) : 0

  const prompt = `Invoice: $${amount.toFixed(2)} coded to ${glCode} (${glName}).\nBudget for this category: $${budgetTotal?.toLocaleString()} total, $${budgetRemaining?.toLocaleString()} remaining before this invoice, $${afterRemaining.toLocaleString()} after.\nUtilization after: ${utilPct.toFixed(1)}%.\nSales MTD: $${salesMtd?.toLocaleString()}.\n\nOne sentence: what does this mean for the operator's budget?`

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        system: IMPACT_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return null
    const body = await res.json()
    const text = (body.content?.[0]?.text || '').trim()
    boundedSet(impactCache, cacheKey, text)
    return text
  } catch {
    return null
  }
}

// ── Prime Cost analysis (PrimeCost page) ─────────────────────────────────────
// Returns { drivingPoints: string[], influencePoints: string[] }

const primeCostCache = new Map()

const PRIMECOST_SYSTEM = `You are a hospitality financial advisor embedded in NURA analyzing prime cost for a restaurant operator. Think logically about the numbers. Give actionable, hospitality-specific insight — not generic advice. Never use encouraging filler like "you're doing great" or "keep it up." Only give insight that affects decisions. No emojis.`

export async function generatePrimeCostAnalysis({
  primeCostPct,
  primeCostTarget,
  totalSales,
  totalLabor,
  fbCogs,
  fbPct,
  laborPct,
  foodSpent,
  foodBudgetTotal,
  foodBudgetRemaining,
  bevSpent,
  weeklyTrend,
  budgetSummary,
  priceChanges,
}) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  const cacheKey = hashNumbers({ primeCostPct, totalSales, fbCogs, totalLabor })
  if (primeCostCache.has(cacheKey)) return primeCostCache.get(cacheKey)

  const dataBlock = [
    `Prime cost: ${primeCostPct?.toFixed(1)}% (target: ${primeCostTarget}%)`,
    `F&B COGS: $${fbCogs?.toLocaleString()} (${fbPct?.toFixed(1)}% of sales)`,
    `Labor: $${totalLabor?.toLocaleString()} (${laborPct?.toFixed(1)}% of sales)`,
    `Sales MTD: $${totalSales?.toLocaleString()}`,
    `Food spend: $${foodSpent?.toLocaleString()} of $${foodBudgetTotal?.toLocaleString()} budget ($${foodBudgetRemaining?.toLocaleString()} remaining)`,
    `Beverage spend: $${bevSpent?.toLocaleString()}`,
    `Weekly revenue: ${weeklyTrend}`,
    budgetSummary ? `Budget summary: ${budgetSummary}` : '',
    priceChanges ? `Vendor price changes this month: ${priceChanges}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = `Here is the prime cost data for this restaurant:\n\n${dataBlock}\n\nGenerate JSON (no markdown, no backticks) with these keys:\n- "drivingPoints": array of 2-3 strings explaining what is driving the current prime cost. Each point should start with a bolded phrase wrapped in <strong> tags, then a specific explanation using real numbers. Think about whether labor vs COGS is the bigger driver, whether this is a volume issue or a cost discipline issue, and whether any vendor price changes are material.\n- "influencePoints": array of 2-3 strings about what the operator can still influence this period. Reference specific remaining budget amounts, untouched categories, revenue trajectory, or vendor substitution opportunities based on price changes. Each point should use <strong> tags for key numbers or actions.\n\nReturn only valid JSON.`

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: PRIMECOST_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      console.error('PrimeCost narrative API error:', res.status)
      return null
    }

    const body = await res.json()
    let raw = body.content?.[0]?.text || ''
    raw = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

    const parsed = JSON.parse(raw)
    boundedSet(primeCostCache, cacheKey, parsed)
    return parsed
  } catch (err) {
    console.error('PrimeCost analysis failed:', err)
    return null
  }
}

const SYSTEM_PROMPT =
  'You are an invoice extraction assistant for NURA, a financial operating system for hospitality operators. Your job is to read invoice images and PDFs and extract structured data. Always respond with valid JSON only — no markdown, no explanation, no preamble, no backticks. Extract these exact fields: vendor_name (string), invoice_date (string YYYY-MM-DD format), invoice_number (string or null), total_amount (number), line_items (array of objects each with description string and amount number), suggested_gl_code (string code number only chosen from the provided list or null if unsure), suggested_gl_name (string GL category name or null), confidence (number 0 to 1 — how confident you are in the full extraction. Below 0.5 means you could not read the invoice clearly or could not determine key fields).'

/**
 * Extract structured invoice data from a base64-encoded image or PDF.
 *
 * @param {string} base64Data  — base64 string (no data URL prefix)
 * @param {string} mediaType   — e.g. 'image/jpeg', 'image/png', 'application/pdf'
 * @param {Array}  glCodes     — array of { code, name } objects for the property
 * @param {Array}  vendors     — array of { name } objects for the property
 * @returns {Object|null}      — extracted data object or null on failure
 */
export const extractInvoiceData = async (base64Data, mediaType, glCodes, vendors) => {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('VITE_ANTHROPIC_API_KEY is not set')
    return null
  }

  const glCodeList = (glCodes || [])
    .map((gl) => `${gl.code} — ${gl.name}`)
    .join('\n')

  const vendorList = (vendors || [])
    .map((v) => v.name)
    .join('\n')

  const userText = `Extract all invoice data from this image. Available GL codes for this property:\n${glCodeList}\nKnown vendors for this property:\n${vendorList}\nMatch vendor_name exactly to a known vendor if possible. Return only valid JSON.`

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: userText,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Anthropic API error:', response.status, errBody)
      return null
    }

    const data = await response.json()
    let rawText = data.content?.[0]?.text || ''

    // Strip accidental markdown backticks
    rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()

    return JSON.parse(rawText)
  } catch (err) {
    console.error('Invoice extraction failed:', err)
    return null
  }
}

// ── Extract sales data from POS report image or PDF ──────────────────────────
// Handles Toast, Square, Clover, Aloha, Micros, and generic X/Z reports.
// Supports multiple files in a single call — the model returns one row per
// document if they cover different periods, or merges them if they're pages of
// one report.
//
// files: Array<{ base64: string, mediaType: string, filename: string }>
// Returns: { periods: [{ period_start, period_end, food_sales, beverage_sales, total_sales, source_filename, confidence }] }
export async function extractSalesData(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('extractSalesData requires at least one file')
  }

  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set')

  const content = [
    {
      type: 'text',
      text: `You are extracting sales data from restaurant POS reports. The user has uploaded ${files.length} file(s). For each distinct reporting period you find, return one entry in the "periods" array.

Rules:
- period_start and period_end are ISO dates (YYYY-MM-DD). For a single-day report, both are the same date.
- food_sales, beverage_sales, and total_sales are numbers in USD (no currency symbol, no commas).
- If beverage sales are broken into liquor/beer/wine, sum them into beverage_sales.
- If the report only shows a total without a food/bev breakdown, set food_sales and beverage_sales to null and fill total_sales.
- confidence is "high", "medium", or "low" — low if the document is blurry, partial, or ambiguous.
- source_filename is the exact filename of the document each period came from.

Return ONLY valid JSON in this shape, nothing else:
{
  "periods": [
    {
      "period_start": "YYYY-MM-DD",
      "period_end": "YYYY-MM-DD",
      "food_sales": number | null,
      "beverage_sales": number | null,
      "total_sales": number,
      "source_filename": "string",
      "confidence": "high" | "medium" | "low"
    }
  ]
}`,
    },
    ...files.flatMap(f => ([
      { type: 'text', text: `\n\nFile: ${f.filename}` },
      f.mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: f.mediaType, data: f.base64 } }
        : { type: 'image',    source: { type: 'base64', media_type: f.mediaType, data: f.base64 } },
    ])),
  ]

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sales extraction failed: ${err}`)
  }

  const data = await res.json()
  let raw = data.content?.[0]?.text || ''
  raw = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in extraction response')
  return JSON.parse(jsonMatch[0])
}

// ── Extract sales data from a single uploaded report ─────────────────────────
export async function extractSalesReport(base64, mediaType) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set')

  const systemPrompt = 'You are a data extraction assistant for NURA a restaurant financial operating system. Read this sales report and extract all sales data you can find. Return valid JSON only with this structure: an array called entries where each entry has date in YYYY-MM-DD format, food_sales as a number, beverage_sales as a number, and total_sales as a number. If you cannot separate food and beverage set both to null and put the total in total_sales. If a field is not present set it to null. Return only valid JSON no markdown no explanation.'

  const imageContent = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: 'Extract all sales data from this report.' }] }],
    }),
  })

  if (!res.ok) throw new Error(`Sales report extraction failed: ${await res.text()}`)

  const data = await res.json()
  let raw = data.content?.[0]?.text || ''
  raw = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
  const match = raw.match(/[\[{][\s\S]*[\]}]/)
  if (!match) throw new Error('No JSON in extraction response')
  const parsed = JSON.parse(match[0])
  return Array.isArray(parsed) ? { entries: parsed } : parsed
}

// ── Extract labor data from a single uploaded report ─────────────────────────
export async function extractLaborReport(base64, mediaType) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('VITE_ANTHROPIC_API_KEY is not set')

  const systemPrompt = 'You are a data extraction assistant for NURA a restaurant financial operating system. Read this labor report or timesheet and extract all labor cost data. Return valid JSON only with this structure: an array called entries where each entry has period_start in YYYY-MM-DD format, period_end in YYYY-MM-DD format, and total_labor as a number representing total labor cost in dollars. If you see hours instead of dollars note that in a field called unit with value hours. Return only valid JSON no markdown no explanation.'

  const imageContent = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mediaType, data: base64 } }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: 'Extract all labor cost data from this report.' }] }],
    }),
  })

  if (!res.ok) throw new Error(`Labor report extraction failed: ${await res.text()}`)

  const data = await res.json()
  let raw = data.content?.[0]?.text || ''
  raw = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
  const match = raw.match(/[\[{][\s\S]*[\]}]/)
  if (!match) throw new Error('No JSON in extraction response')
  const parsed = JSON.parse(match[0])
  return Array.isArray(parsed) ? { entries: parsed } : parsed
}
