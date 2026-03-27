import { supabase } from './supabase'

// ── Default GL codes and vendors seeded for every new property ────────────────

const DEFAULT_GL_CODES = [
  { code: '5217250', name: 'Food Purchases',     category: 'food',     monthly_budget: 0, sort_order: 1 },
  { code: '5217257', name: 'Liquor',             category: 'liquor',   monthly_budget: 0, sort_order: 2 },
  { code: '5217255', name: 'Wine',               category: 'wine',     monthly_budget: 0, sort_order: 3 },
  { code: '5217258', name: 'Beer',               category: 'beer',     monthly_budget: 0, sort_order: 4 },
  { code: '5217275', name: 'Operating Supplies', category: 'supplies', monthly_budget: 0, sort_order: 5 },
  { code: '5217280', name: 'Uniforms',           category: 'uniforms', monthly_budget: 0, sort_order: 6 },
]

const DEFAULT_VENDORS = [
  { name: 'Baldor',    default_gl_code: '5217250', delivery_frequency: 'Twice weekly' },
  { name: 'US Foods',  default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Keany',     default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Profish',   default_gl_code: '5217250', delivery_frequency: 'Weekly' },
  { name: 'Breakthru', default_gl_code: '5217257', delivery_frequency: 'Weekly' },
  { name: 'Alsco',     default_gl_code: '5217275', delivery_frequency: 'Weekly' },
]

/**
 * Create a new property row, seed 6 default GL codes and 6 default vendors.
 * Used by both the Controller "Add Property" modal and the Onboarding portfolio step.
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

  // 2. Seed default GL codes (monthly_budget = 0)
  const glRows = DEFAULT_GL_CODES.map((gl) => ({
    property_id:    propertyId,
    code:           gl.code,
    name:           gl.name,
    category:       gl.category,
    monthly_budget: gl.monthly_budget,
    sort_order:     gl.sort_order,
  }))

  await supabase.from('gl_codes').insert(glRows)

  // 3. Seed default vendors
  const vendorRows = DEFAULT_VENDORS.map((v) => ({
    property_id:        propertyId,
    name:               v.name,
    default_gl_code:    v.default_gl_code,
    delivery_frequency: v.delivery_frequency,
    is_active:          true,
  }))

  await supabase.from('vendors').insert(vendorRows)

  return { property: newProp, error: null }
}
