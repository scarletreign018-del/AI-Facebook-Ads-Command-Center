-- Migration 005g: Add soft delete support to core tables

-- Add deleted_at columns
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.meta_campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.meta_ad_sets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.meta_ads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create function for soft delete
CREATE OR REPLACE FUNCTION public.soft_delete(table_name text, record_id uuid)
RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE %I SET deleted_at = NOW() WHERE id = %L', table_name, record_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update RLS policies to exclude soft-deleted records
-- Workspaces
DROP POLICY IF EXISTS "select_workspace_as_member" ON public.workspaces;
CREATE POLICY "select_workspace_as_member" ON public.workspaces FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND (
      id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
      OR owner_id = auth.uid()
    )
  );

-- Meta connections
DROP POLICY IF EXISTS "select_meta_connections_as_member" ON public.meta_connections;
CREATE POLICY "select_meta_connections_as_member" ON public.meta_connections FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Campaigns
DROP POLICY IF EXISTS "select_campaigns_as_member" ON public.meta_campaigns;
CREATE POLICY "select_campaigns_as_member" ON public.meta_campaigns FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND meta_connection_id IN (
      SELECT id FROM public.meta_connections WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Ad sets
DROP POLICY IF EXISTS "select_adsets_as_member" ON public.meta_ad_sets;
CREATE POLICY "select_adsets_as_member" ON public.meta_ad_sets FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND meta_connection_id IN (
      SELECT id FROM public.meta_connections WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Ads
DROP POLICY IF EXISTS "select_ads_as_member" ON public.meta_ads;
CREATE POLICY "select_ads_as_member" ON public.meta_ads FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND meta_connection_id IN (
      SELECT id FROM public.meta_connections WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );