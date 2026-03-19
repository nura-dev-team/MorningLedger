-- ============================================================
-- NURA — Seed Data: SYN January 2026
-- Run AFTER schema.sql
--
-- This seeds real operational data from the SYN pilot property
-- at Donohoe Hospitality for January 2026.
--
-- Note: 19 invoices total (16 from the brief + 3 balancing
-- invoices calculated to match the $5,571 total spend figure
-- and per-GL-code budget actuals from the Budgets screen).
-- ============================================================

-- ── Fixed UUIDs ─────────────────────────────────────────────
-- Using consistent UUIDs so re-running this seed is idempotent

-- Property
-- SYN: '11111111-1111-1111-1111-111111111111'

-- GL Codes
-- Food Purchases:     '22222222-2222-2222-2222-222222222201'
-- Liquor:             '22222222-2222-2222-2222-222222222202'
-- Wine:               '22222222-2222-2222-2222-222222222203'
-- Beer:               '22222222-2222-2222-2222-222222222204'
-- Operating Supplies: '22222222-2222-2222-2222-222222222205'
-- Uniforms:           '22222222-2222-2222-2222-222222222206'

-- Vendors
-- Baldor:    '33333333-3333-3333-3333-333333333301'
-- US Foods:  '33333333-3333-3333-3333-333333333302'
-- Breakthru: '33333333-3333-3333-3333-333333333303'
-- Profish:   '33333333-3333-3333-3333-333333333304'
-- Keany:     '33333333-3333-3333-3333-333333333305'
-- Alsco:     '33333333-3333-3333-3333-333333333306'

-- ── 1. Property ─────────────────────────────────────────────

INSERT INTO properties (id, name, timezone, prime_cost_target) VALUES
  ('11111111-1111-1111-1111-111111111111', 'SYN', 'America/New_York', 62.0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  prime_cost_target = EXCLUDED.prime_cost_target;

-- ── 2. GL Codes / Budget Categories ─────────────────────────

INSERT INTO gl_codes (id, property_id, code, name, category, monthly_budget, sort_order) VALUES
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', '5217250', 'Food Purchases',     'food',     7722.00, 1),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', '5217257', 'Liquor',             'liquor',   3533.00, 2),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', '5217255', 'Wine',               'wine',     2933.00, 3),
  ('22222222-2222-2222-2222-222222222204', '11111111-1111-1111-1111-111111111111', '5217258', 'Beer',               'beer',     1786.00, 4),
  ('22222222-2222-2222-2222-222222222205', '11111111-1111-1111-1111-111111111111', '5217275', 'Operating Supplies', 'supplies',  118.00, 5),
  ('22222222-2222-2222-2222-222222222206', '11111111-1111-1111-1111-111111111111', '5217280', 'Uniforms',           'uniforms',  195.00, 6)
ON CONFLICT (property_id, code) DO UPDATE SET
  name           = EXCLUDED.name,
  monthly_budget = EXCLUDED.monthly_budget,
  sort_order     = EXCLUDED.sort_order;

-- ── 3. Vendors ───────────────────────────────────────────────

INSERT INTO vendors (id, property_id, name, default_gl_code, delivery_frequency) VALUES
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'Baldor',    '5217250', 'Twice weekly'),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'US Foods',  '5217250', 'Weekly'),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'Breakthru', '5217257', 'Weekly'),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', 'Profish',   '5217250', 'Weekly'),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111111', 'Keany',     '5217250', 'Weekly'),
  ('33333333-3333-3333-3333-333333333306', '11111111-1111-1111-1111-111111111111', 'Alsco',     '5217275', 'Weekly')
ON CONFLICT (id) DO NOTHING;

-- ── 4. Invoices (January 2026) ───────────────────────────────
-- All 19 invoices: 16 from the brief + 3 calculated to balance totals.
-- Per-GL actuals: Food $4,010 | Liquor $1,170 | Wine $127 | Beer $0 | Supplies $229 | Uniforms $35
-- Grand total: $5,571.00

INSERT INTO invoices
  (property_id, vendor_id, invoice_number, invoice_date, amount, description, gl_code, status, approved_at)
VALUES
  -- Jan 29 deliveries
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', 'BT-20260129-001', '2026-01-29',  542.31, 'Liquor',            '5217257', 'approved', '2026-01-29 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'BA-20260129-001', '2026-01-29',  380.13, 'Food / meats',       '5217250', 'approved', '2026-01-29 09:15:00+00'),

  -- Jan 24
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333304', 'PF-20260124-001', '2026-01-24',  327.20, 'Seafood',            '5217250', 'approved', '2026-01-24 09:00:00+00'),

  -- Jan 23 deliveries
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'BA-20260123-001', '2026-01-23',  432.00, 'Food',               '5217250', 'approved', '2026-01-23 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', 'BT-20260123-001', '2026-01-23',  410.55, 'Liquor',             '5217257', 'approved', '2026-01-23 09:30:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', 'BT-20260123-002', '2026-01-23',  126.93, 'Wine',               '5217255', 'approved', '2026-01-23 09:45:00+00'),

  -- Jan 22 deliveries
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'BA-20260122-001', '2026-01-22',  163.28, 'Cheese / garnishes', '5217250', 'approved', '2026-01-22 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333306', 'AL-20260122-001', '2026-01-22',   64.12, 'Operating supplies', '5217275', 'approved', '2026-01-22 09:15:00+00'),

  -- Jan 15 deliveries
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', 'UF-20260115-001', '2026-01-15',  312.34, 'Dry grocery / poultry','5217250','approved','2026-01-15 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333304', 'PF-20260115-001', '2026-01-15',  254.87, 'Seafood',            '5217250', 'approved', '2026-01-15 09:15:00+00'),

  -- Jan 13
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', 'UF-20260113-001', '2026-01-13',  283.07, 'Meat',               '5217250', 'approved', '2026-01-13 09:00:00+00'),

  -- Jan 8 deliveries (3 additional invoices to balance totals)
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'BA-20260108-001', '2026-01-08',  317.32, 'Meat / proteins',    '5217250', 'approved', '2026-01-08 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', 'BT-20260108-001', '2026-01-08',  217.14, 'Liquor',             '5217257', 'approved', '2026-01-08 09:30:00+00'),

  -- Jan 6 deliveries
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333305', 'KE-20260106-001', '2026-01-06',  564.35, 'Produce / veggies',  '5217250', 'approved', '2026-01-06 09:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', 'UF-20260106-001', '2026-01-06',  406.63, 'Meat / garnishes',   '5217250', 'approved', '2026-01-06 09:15:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'BA-20260106-001', '2026-01-06',  245.47, 'Sauce / rice / cheese','5217250','approved','2026-01-06 09:30:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333304', 'PF-20260106-001', '2026-01-06',  323.41, 'Seafood',            '5217250', 'approved', '2026-01-06 09:45:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333306', 'AL-20260106-001', '2026-01-06',  164.88, 'Operating supplies', '5217275', 'approved', '2026-01-06 10:00:00+00'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333306', 'AL-20260106-002', '2026-01-06',   35.00, 'Uniforms',           '5217280', 'approved', '2026-01-06 10:15:00+00');

-- Verify totals (run this as a check after seeding):
-- SELECT gl_code, SUM(amount) as total FROM invoices
-- WHERE property_id = '11111111-1111-1111-1111-111111111111' AND status = 'approved'
-- GROUP BY gl_code ORDER BY gl_code;
--
-- Expected:
--   5217250 → $4,010.07 (Food)
--   5217255 → $126.93   (Wine)
--   5217257 → $1,170.00 (Liquor)
--   5217275 → $229.00   (Op. Supplies)
--   5217280 → $35.00    (Uniforms)
--   Total   → $5,571.00

-- ── 5. Sales Entries (Jan 2026 — 5 weeks) ───────────────────
-- Dates represent the last day of each operating week

INSERT INTO sales_entries
  (property_id, date, week_number, food_sales, beverage_sales, total_sales)
VALUES
  ('11111111-1111-1111-1111-111111111111', '2026-01-04', 1,  680.00,  226.00,   906.00),
  ('11111111-1111-1111-1111-111111111111', '2026-01-11', 2,  970.00,  326.00,  1296.00),
  ('11111111-1111-1111-1111-111111111111', '2026-01-18', 3, 1470.00,  487.00,  1957.00),
  ('11111111-1111-1111-1111-111111111111', '2026-01-25', 4, 2600.00,  877.00,  3477.00),
  ('11111111-1111-1111-1111-111111111111', '2026-01-31', 5, 4180.00, 1396.00,  5576.00)
ON CONFLICT (property_id, date) DO UPDATE SET
  week_number    = EXCLUDED.week_number,
  food_sales     = EXCLUDED.food_sales,
  beverage_sales = EXCLUDED.beverage_sales,
  total_sales    = EXCLUDED.total_sales;

-- MTD total: $13,212 (brief rounds to $13,213)

-- ── 6. Labor Entry (Jan 2026) ────────────────────────────────
-- Single MTD labor entry — labor is fixed regardless of revenue during ramp-up

INSERT INTO labor_entries
  (property_id, period_start, period_end, total_labor)
VALUES
  ('11111111-1111-1111-1111-111111111111', '2026-01-01', '2026-01-31', 19053.00);

-- ── 7. Pending Approvals (2 invoices waiting for review) ─────
-- These are the two invoices shown in the Approvals screen prototype.
-- They are NOT yet approved so they appear in the pending queue.

INSERT INTO invoices
  (property_id, vendor_id, invoice_number, invoice_date, amount, description, gl_code, status)
VALUES
  -- Baldor $380.13 — within budget, one-tap approve
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301',
   'BA-20260129-PEND', '2026-01-29', 380.13, 'Food / meats', '5217250', 'pending'),

  -- Alsco $79.00 — over budget, reason required
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333306',
   'AL-20260122-PEND', '2026-01-22',  79.00, 'Operating supplies', '5217275', 'pending')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Seed complete. Expected state:
--
--   Properties:    1 (SYN)
--   GL Codes:      6
--   Vendors:       6
--   Invoices:      21 total (19 approved + 2 pending)
--   Sales entries: 5 (weeks 1–5, MTD $13,212)
--   Labor entries: 1 (Jan MTD $19,053)
--
-- Prime Cost calculation:
--   F&B COGS: $5,307 (food+bev approved invoices)
--   Labor:    $19,053
--   Sales:    $13,212
--   PC%:      (5307 + 19053) / 13212 * 100 = 184.4%
-- ============================================================
