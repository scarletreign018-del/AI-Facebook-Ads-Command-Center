-- Migration 005f: Set up cron job for weekly token refresh
-- Uses pg_net extension for HTTP calls (available on Supabase)

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule a background worker to call the meta-refresh edge function weekly
-- Note: In production, this should be configured via Supabase Dashboard cron jobs
-- or an external scheduler (e.g., Vercel Cron, GitHub Actions)

-- Document the expected cron configuration
COMMENT ON TABLE public.meta_connections IS 'Meta OAuth connections. Tokens expire after ~60 days. A cron job should call the meta-refresh edge function weekly to refresh tokens before expiry.';

-- Add a trigger to warn when tokens are close to expiry
CREATE OR REPLACE FUNCTION public.warn_token_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token_expires_at IS NOT NULL AND NEW.token_expires_at < NOW() + INTERVAL '14 days' THEN
    RAISE WARNING 'Meta connection % token expires in less than 14 days: %', NEW.id, NEW.token_expires_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the warning trigger
DROP TRIGGER IF EXISTS check_token_expiry ON public.meta_connections;
CREATE TRIGGER check_token_expiry
  AFTER UPDATE ON public.meta_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.warn_token_expiry();