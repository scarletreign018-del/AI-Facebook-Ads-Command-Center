-- Test if campaigns query works with current RLS policies
-- Run this as the authenticated user (not service role)

-- First, check if you can see campaigns at all
SELECT COUNT(*) as total FROM meta_campaigns;

-- Check if you can see campaigns with basic info
SELECT 
  id,
  name,
  status,
  effective_status
FROM meta_campaigns
LIMIT 5;

-- Now test the full query that the API uses (with JOIN)
SELECT 
  c.id,
  c.campaign_id,
  c.name,
  c.objective,
  c.status,
  c.effective_status,
  c.budget_remaining,
  c.daily_budget,
  c.lifetime_budget,
  c.start_time,
  c.stop_time,
  c.last_synced_at,
  a.id as ad_account_id,
  a.name as ad_account_name,
  a.currency as ad_account_currency
FROM meta_campaigns c
LEFT JOIN meta_ad_accounts a ON c.ad_account_id = a.id
LIMIT 5;

-- Check which workspace and connection you have access to
SELECT 
  w.id as workspace_id,
  w.name as workspace_name,
  mc.id as connection_id,
  mc.facebook_user_name
FROM workspace_members wm
JOIN workspaces w ON wm.workspace_id = w.id
LEFT JOIN meta_connections mc ON mc.workspace_id = w.id
WHERE wm.user_id = auth.uid();
