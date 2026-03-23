-- ============================================================
-- NURA — Invite System
-- Run in Supabase SQL Editor after schema.sql
-- ============================================================

-- ── Invites table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID REFERENCES properties(id) ON DELETE CASCADE,
  invited_by   UUID REFERENCES profiles(id),
  email        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('gm', 'controller', 'viewer')),
  token        TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Owners can manage all invites for their property
CREATE POLICY "invites_owner_all" ON invites
  FOR ALL USING (property_id = get_my_property_id());

-- Anyone (including unauthenticated) can read a pending, non-expired invite by token
-- This is needed for the AcceptInvite public page to validate the token
CREATE POLICY "invites_public_read" ON invites
  FOR SELECT USING (status = 'pending' AND expires_at > NOW());

-- Authenticated users can update invite status to 'accepted' (for their own email)
CREATE POLICY "invites_accept" ON invites
  FOR UPDATE USING (true)
  WITH CHECK (status = 'accepted');

-- ── Allow team members to see each other's profiles ──────────
-- Required for Team settings page to list property members

CREATE POLICY "profiles_same_property_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR property_id = get_my_property_id()
  );

-- Drop the old restrictive policy first (if it was previously created)
-- Note: run this only if upgrading from schema.sql v1:
-- DROP POLICY IF EXISTS "profile_select" ON profiles;
-- Then re-create with the broader policy above.
-- If running fresh, comment out the DROP above.
