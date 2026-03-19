-- ============================================================
-- NURA — Database Schema v1
-- Run this entire file in the Supabase SQL Editor
-- Project: https://qihavywnpozkxqwosmze.supabase.co
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

-- Properties (hospitality venues / restaurants)
CREATE TABLE IF NOT EXISTS properties (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'America/New_York',
  prime_cost_target   DECIMAL(5,2) NOT NULL DEFAULT 62.0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles (extends Supabase auth.users 1:1)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'gm'
                CHECK (role IN ('owner', 'gm', 'controller', 'viewer')),
  property_id UUID REFERENCES properties(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GL Codes / Budget Categories
CREATE TABLE IF NOT EXISTS gl_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL
                    CHECK (category IN ('food','liquor','wine','beer','supplies','uniforms','labor','other')),
  monthly_budget  DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, code)
);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  default_gl_code     TEXT,
  ap_email            TEXT,
  delivery_frequency  TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoices
-- Phase 2: ingestion via vendor email (Gmail API) + OCR
-- Phase 1: manual entry via the Approvals screen
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  vendor_id       UUID REFERENCES vendors(id),
  invoice_number  TEXT,
  invoice_date    DATE NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  description     TEXT,
  gl_code         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','held','duplicate')),
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  approval_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dedup key: same invoice number + vendor + property cannot appear twice
  UNIQUE NULLS NOT DISTINCT (property_id, invoice_number, vendor_id)
);

-- Sales Entries
-- Phase 1: manual entry via /settings/data
-- Phase 2: replaced by Toast POS / Square / Clover integration
CREATE TABLE IF NOT EXISTS sales_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  week_number     INTEGER,
  food_sales      DECIMAL(10,2) NOT NULL DEFAULT 0,
  beverage_sales  DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_sales     DECIMAL(10,2) NOT NULL,
  entered_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, date)
);

-- Labor Entries
-- Phase 1: manual entry via /settings/data
-- Phase 2: replaced by 7shifts / Homebase integration
CREATE TABLE IF NOT EXISTS labor_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  total_labor   DECIMAL(10,2) NOT NULL,
  entered_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Trigger: auto-create profile on signup ───────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Helper: get the current user's property_id ───────────────
-- Used by RLS policies below

CREATE OR REPLACE FUNCTION get_my_property_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT property_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ── Row Level Security ───────────────────────────────────────

ALTER TABLE properties   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE labor_entries ENABLE ROW LEVEL SECURITY;

-- Properties:
--   Authenticated users with no property_id (onboarding) can see all properties
--   to select/join one. After joining, only their property is visible.
CREATE POLICY "property_select" ON properties
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (id = get_my_property_id() OR get_my_property_id() IS NULL)
  );

-- Only controllers/owners can create or modify properties
CREATE POLICY "property_insert" ON properties
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Profiles: users can only read and update their own profile
CREATE POLICY "profile_select" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profile_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profile_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- GL Codes: scoped to the user's property
CREATE POLICY "gl_codes_all" ON gl_codes
  FOR ALL USING (property_id = get_my_property_id());

-- Vendors: scoped to the user's property
CREATE POLICY "vendors_all" ON vendors
  FOR ALL USING (property_id = get_my_property_id());

-- Invoices: scoped to the user's property
CREATE POLICY "invoices_all" ON invoices
  FOR ALL USING (property_id = get_my_property_id());

-- Sales entries: scoped to the user's property
CREATE POLICY "sales_all" ON sales_entries
  FOR ALL USING (property_id = get_my_property_id());

-- Labor entries: scoped to the user's property
CREATE POLICY "labor_all" ON labor_entries
  FOR ALL USING (property_id = get_my_property_id());
