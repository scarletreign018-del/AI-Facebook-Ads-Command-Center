-- Migration 005d: Complete RLS policies for all tables (v3)
-- Only adds policies that don't already exist

-- ============================================
-- meta_ad_accounts: Add DELETE
-- ============================================
CREATE POLICY "delete_ad_accounts_as_admin" ON public.meta_ad_accounts FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_campaigns: Add INSERT, UPDATE, DELETE
-- ============================================
CREATE POLICY "insert_campaigns_as_member" ON public.meta_campaigns FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_campaigns_as_admin" ON public.meta_campaigns FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_campaigns_as_admin" ON public.meta_campaigns FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_ad_sets: Add INSERT, UPDATE, DELETE
-- ============================================
CREATE POLICY "insert_adsets_as_member" ON public.meta_ad_sets FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_adsets_as_admin" ON public.meta_ad_sets FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_adsets_as_admin" ON public.meta_ad_sets FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_ads: Add INSERT, UPDATE, DELETE
-- ============================================
CREATE POLICY "insert_ads_as_member" ON public.meta_ads FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_ads_as_admin" ON public.meta_ads FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_ads_as_admin" ON public.meta_ads FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_insights: Add INSERT, UPDATE, DELETE
-- ============================================
CREATE POLICY "insert_insights_as_member" ON public.meta_insights FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_insights_as_admin" ON public.meta_insights FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_insights_as_admin" ON public.meta_insights FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_sync_logs: Add INSERT, UPDATE, DELETE
-- ============================================
CREATE POLICY "insert_synclogs_as_member" ON public.meta_sync_logs FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_synclogs_as_admin" ON public.meta_sync_logs FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_synclogs_as_admin" ON public.meta_sync_logs FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- meta_sync_state: Add policies
-- ============================================
CREATE POLICY "select_syncstate_as_member" ON public.meta_sync_state FOR SELECT
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "insert_syncstate_as_member" ON public.meta_sync_state FOR INSERT
  TO authenticated WITH CHECK (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "update_syncstate_as_admin" ON public.meta_sync_state FOR UPDATE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "delete_syncstate_as_admin" ON public.meta_sync_state FOR DELETE
  TO authenticated USING (
    meta_connection_id IN (
      SELECT id FROM public.meta_connections 
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
  );

-- ============================================
-- campaign_health_scores: Add UPDATE policy
-- ============================================
CREATE POLICY "update_own_health_scores" ON public.campaign_health_scores FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = campaign_health_scores.workspace_id
      AND wm.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = campaign_health_scores.workspace_id
      AND wm.user_id = auth.uid()
    )
  );