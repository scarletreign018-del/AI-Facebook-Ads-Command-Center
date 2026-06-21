/**
 * Environment variable validation for edge functions.
 * Throws descriptive errors when required variables are missing.
 */

export interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ENCRYPTION_KEY: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_REDIRECT_URI?: string;
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnv(required: string[]): EnvConfig {
  const config: Partial<EnvConfig> = {};
  const missing: string[] = [];

  for (const key of required) {
    try {
      (config as Record<string, string>)[key] = getEnv(key);
    } catch {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Please configure these in your Supabase project settings.`
    );
  }

  return config as EnvConfig;
}

export function getSupabaseClient() {
  const env = validateEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const { createClient } = require('jsr:@supabase/supabase-js@2');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
