import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encrypt } from '../_shared/crypto.ts';
import { validateEnv } from '../_shared/env.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Validate all required env vars at startup
const env = validateEnv([
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENCRYPTION_KEY',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_REDIRECT_URI'
]);

const META_APP_ID = env.META_APP_ID!;
const META_APP_SECRET = env.META_APP_SECRET!;
const META_REDIRECT_URI = env.META_REDIRECT_URI!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('action') || 'authorize';

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === 'GET' && path === 'authorize') {
    const state = crypto.randomUUID();
    const scope = 'email,public_profile,business_management,ads_management,ads_read';

    const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
    authUrl.searchParams.set('client_id', META_APP_ID);
    authUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');

    return new Response(JSON.stringify({
      authUrl: authUrl.toString(),
      state
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'POST' && path === 'callback') {
    try {
      const body = await req.json();
      const { code, state, workspace_id, user_id } = body;

      if (!code || !workspace_id || !user_id) {
        return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Exchange code for access token
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `client_id=${META_APP_ID}&` +
        `client_secret=${META_APP_SECRET}&` +
        `redirect_uri=${META_REDIRECT_URI}&` +
        `code=${code}`,
        { method: 'GET' }
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        return new Response(JSON.stringify({
          error: tokenData.error.message || 'Failed to exchange code for token'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const accessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in || 5184000;

      // Get long-lived token
      const longLivedResponse = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
        `grant_type=fb_exchange_token&` +
        `client_id=${META_APP_ID}&` +
        `client_secret=${META_APP_SECRET}&` +
        `fb_exchange_token=${accessToken}`
      );

      const longLivedData = await longLivedResponse.json();
      const longLivedToken = longLivedData.access_token || accessToken;
      const longLivedExpires = longLivedData.expires_in || expiresIn;

      // Get user info from Meta
      const userResponse = await fetch(
        `https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.width(200).height(200)&access_token=${longLivedToken}`
      );

      const userData = await userResponse.json();

      if (userData.error) {
        return new Response(JSON.stringify({
          error: userData.error.message || 'Failed to fetch user info'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const expiresAt = new Date(Date.now() + (longLivedExpires * 1000));

      // Encrypt the tokens using AES-256-GCM
      const encryptedAccessToken = await encrypt(longLivedToken);

      // Check if connection already exists
      const { data: existingConnection } = await supabase
        .from('meta_connections')
        .select('id')
        .eq('workspace_id', workspace_id)
        .eq('facebook_user_id', userData.id)
        .single();

      let connectionId: string;

      if (existingConnection) {
        const { data, error } = await supabase
          .from('meta_connections')
          .update({
            encrypted_access_token: encryptedAccessToken,
            token_expires_at: expiresAt.toISOString(),
            status: 'active',
            last_error_message: null,
            facebook_user_name: userData.name,
            facebook_user_email: userData.email,
            facebook_user_picture_url: userData.picture?.data?.url,
            granted_scopes: ['email', 'public_profile', 'business_management', 'ads_management', 'ads_read'],
            updated_at: new Date().toISOString()
          })
          .eq('id', existingConnection.id)
          .select('id')
          .single();

        if (error) throw error;
        connectionId = data.id;
      } else {
        const { data, error } = await supabase
          .from('meta_connections')
          .insert({
            workspace_id,
            user_id,
            facebook_user_id: userData.id,
            facebook_user_name: userData.name,
            facebook_user_email: userData.email,
            facebook_user_picture_url: userData.picture?.data?.url,
            encrypted_access_token: encryptedAccessToken,
            token_expires_at: expiresAt.toISOString(),
            granted_scopes: ['email', 'public_profile', 'business_management', 'ads_management', 'ads_read'],
            status: 'active'
          })
          .select('id')
          .single();

        if (error) throw error;
        connectionId = data.id;
      }

      // Fetch and store business managers
      await fetchBusinessManagers(supabase, connectionId, longLivedToken);

      return new Response(JSON.stringify({
        success: true,
        connection: {
          id: connectionId,
          facebook_user_id: userData.id,
          facebook_user_name: userData.name,
          facebook_user_email: userData.email,
          facebook_user_picture_url: userData.picture?.data?.url
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error: unknown) {
      console.error('OAuth callback error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});

async function fetchBusinessManagers(supabase: unknown, connectionId: string, accessToken: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,logo_url&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      for (const business of data.data) {
        const { data: bmData } = await supabase
          .from('meta_business_managers')
          .upsert({
            meta_connection_id: connectionId,
            business_manager_id: business.id,
            name: business.name,
            profile_picture_url: business.logo_url,
            last_synced_at: new Date().toISOString()
          }, {
            onConflict: 'meta_connection_id,business_manager_id'
          })
          .select('id')
          .single();

        if (bmData) {
          await fetchAdAccounts(supabase, connectionId, bmData.id, business.id, accessToken);
        }
      }
    }
  } catch (error: unknown) {
    console.error('Error fetching business managers:', error);
  }
}

async function fetchAdAccounts(supabase: unknown, connectionId: string, bmDbId: string, businessId: string, accessToken: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${businessId}/owned_ad_accounts?fields=id,name,account_status,currency,timezone_name,amount_spent,balance&access_token=${accessToken}`
    );

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      for (const account of data.data) {
        await supabase
          .from('meta_ad_accounts')
          .upsert({
            meta_connection_id: connectionId,
            business_manager_id: bmDbId,
            ad_account_id: account.id,
            name: account.name,
            account_status: account.account_status,
            currency: account.currency,
            timezone_name: account.timezone_name,
            amount_spent: parseFloat(account.amount_spent) || 0,
            balance: parseFloat(account.balance) || 0,
            last_synced_at: new Date().toISOString()
          }, {
            onConflict: 'meta_connection_id,ad_account_id'
          });
      }
    }
  } catch (error: unknown) {
    console.error('Error fetching ad accounts:', error);
  }
}
