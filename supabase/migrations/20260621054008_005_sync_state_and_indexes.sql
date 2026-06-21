-- Migration 005: Sync State Table and Additional Indexes
-- This migration was originally skipped but is now added for completeness.

-- Add composite index for meta_insights date range queries
CREATE INDEX IF NOT EXISTS idx_meta_insights_date_range ON public.meta_insights(date DESC, entity_type, entity_id_meta);

-- Add index for campaign status queries
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_objective ON public.meta_campaigns(objective);

-- Add index for ad set targeting queries
CREATE INDEX IF NOT EXISTS idx_meta_ad_sets_targeting ON public.meta_ad_sets USING gin(targeting);

-- Add index for ad creative queries
CREATE INDEX IF NOT EXISTS idx_meta_ads_creative ON public.meta_ads USING gin(creative);

-- Add index for insights actions queries
CREATE INDEX IF NOT EXISTS idx_meta_insights_actions ON public.meta_insights USING gin(actions);

-- Add index for sync logs date range
CREATE INDEX IF NOT EXISTS idx_meta_sync_logs_date ON public.meta_sync_logs(created_at DESC);

-- Add index for audit logs date range
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON public.audit_logs(created_at DESC);

-- Add index for notification read status
CREATE INDEX IF NOT EXISTS idx_user_notifications_read_created ON public.user_notifications(read, created_at DESC);

-- Add index for campaign health scores date
CREATE INDEX IF NOT EXISTS idx_campaign_health_scores_date ON public.campaign_health_scores(computed_at DESC);

-- Add index for recommendations status and date
CREATE INDEX IF NOT EXISTS idx_campaign_recommendations_status_created ON public.campaign_recommendations(status, created_at DESC);

-- Add index for forecasts type and date
CREATE INDEX IF NOT EXISTS idx_campaign_forecasts_type_generated ON public.campaign_forecasts(forecast_type, generated_at DESC);

-- Add index for alerts status and severity
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_status_severity ON public.campaign_alerts(status, severity);

-- Add index for reports status
CREATE INDEX IF NOT EXISTS idx_campaign_reports_status_created ON public.campaign_reports(status, created_at DESC);

-- Add index for shareable reports expiry
CREATE INDEX IF NOT EXISTS idx_shareable_reports_expires ON public.shareable_reports(expires_at);

-- Add index for workspace slug lookups
CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON public.workspaces(slug);