import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encrypt, decrypt } from '../_shared/crypto.ts';
import { validateEnv } from '../_shared/env.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const env = validateEnv([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'META_APP_ID',
  'META_APP_SECRET'
]);

const META_APP_ID = env.META_APP_ID!;
const META_APP_SECRET = env.META_APP_SECRET!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { data: connections, error: fetchError } = await supabase
      .from('meta_connections')
      .select('id, encrypted_access_token, token_expires_at')
      .eq('status', 'active')
      .lt('token_expires_at', sevenDaysFromNow.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    const results: Array<{ id: string; status: string; expires_at?: string; error?: string }> = [];

    for (const connection of connections || []) {
      try {
        const currentToken = await decrypt(connection.encrypted_access_token);

        const response = await fetch(
          `https://graph.facebook.com/v19.0/oauth/access_token?` +
          `grant_type=fb_exchange_token&` +
          `client_id=${META_APP_ID}&` +
          `client_secret=${META_APP_SECRET}&` +
          `fb_exchange_token=${currentToken}`
        );

        const data = await response.json();

        if (data.error) {
          await supabase
            .from('meta_connections')
            .update({
              status: 'error',
              last_error_message: data.error.message,
              updated_at: new Date().toISOString()
            })
            .eq('id', connection.id);

          results.push({ id: connection.id, status: 'error', error: data.error.message });
          continue;
        }

        const newToken = data.access_token;
        const newExpiresIn = data.expires_in || 5184000;
        const newExpiresAt = new Date(Date.now() + (newExpiresIn * 1000));

        const encryptedToken = await encrypt(newToken);

        await supabase
          .from('meta_connections')
          .update({
            encrypted_access_token: encryptedToken,
            token_expires_at: newExpiresAt.toISOString(),
            status: 'active',
            last_error_message: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', connection.id);

        results.push({ id: connection.id, status: 'refreshed', expires_at: newExpiresAt.toISOString() });

      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error during refresh';
        results.push({ id: connection.id, status: 'error', error: message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('Token refresh error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
