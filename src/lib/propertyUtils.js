import { supabase } from './supabase'

// ── Default GL code categories seeded for every new property ─────────────────

const DEFAULT_GL_CODES = [
  { code: '', name: 'Food Purchases',     category: 'food',     monthly_budget: 0, sort_order: 1 },
  { code: '', name: 'Liquor',             category: 'liquor',   monthly_budget: 0, sort_order: 2 },
  { code: '', name: 'Wine',               category: 'wine',     monthly_budget: 0, sort_order: 3 },
  { code: '', name: 'Beer',               category: 'beer',     monthly_budget: 0, sort_order: 4 },
  { code: '', name: 'Operating Supplies', category: 'supplies', monthly_budget: 0, sort_order: 5 },
  { code: '', name: 'Uniforms',           category: 'uniforms', monthly_budget: 0, sort_order: 6 },
]

/**
 * Create a new property row and seed 6 default GL code categories.
 * Vendors are no longer auto-seeded — operators add them via Settings > Enter Data > Vendors.
 *
 * @param {Object} formData — { name, timezone, prime_cost_target, type?, city?, location_count? }
 * @param {string} ownerId  — profile.id of the owner creating the property
 * @returns {{ property: Object|null, error: string|null }}
 */
export const createPropertyWithDefaults = async (formData, ownerId) => {
  // 1. Create the property row
  const { data: newProp, error: propErr } = await supabase
    .from('properties')
    .insert({
      name:              formData.name,
      timezone:          formData.timezone || 'America/New_York',
      prime_cost_target: formData.prime_cost_target ?? 62.0,
      owner_id:          ownerId,
      type:              formData.type || null,
      city:              formData.city || null,
      location_count:    formData.location_count ?? 1,
    })
    .select()
    .single()

  if (propErr) return { property: null, error: propErr.message }

  const propertyId = newProp.id

  // 2. Seed default GL code categories (code blank, monthly_budget = 0)
  const glRows = DEFAULT_GL_CODES.map((gl) => ({
    property_id:    propertyId,
    code:           gl.code,
    name:           gl.name,
    category:       gl.category,
    monthly_budget: gl.monthly_budget,
    sort_order:     gl.sort_order,
  }))

  await supabase.from('gl_codes').insert(glRows)

  return { property: newProp, error: null }
}
