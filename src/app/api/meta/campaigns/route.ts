import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const connectionId = searchParams.get('connection_id')
  const adAccountId = searchParams.get('ad_account_id')
  const status = searchParams.get('status')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')

  // Verify access
  if (connectionId) {
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('workspace_id')
      .eq('id', connectionId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', connection.workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  // Build query
  let query = supabase
    .from('meta_campaigns')
    .select(`
      id,
      campaign_id,
      name,
      objective,
      status,
      effective_status,
      budget_remaining,
      daily_budget,
      lifetime_budget,
      start_time,
      stop_time,
      last_synced_at,
      ad_account:meta_ad_accounts(id, name, currency)
    `)
    .order('name', { ascending: true })
    .limit(limit)

  if (connectionId) {
    query = query.eq('meta_connection_id', connectionId)
  }

  if (adAccountId) {
    query = query.eq('ad_account_id', adAccountId)
  }

  if (status && status !== 'all') {
    query = query.or(`status.eq.${status},effective_status.eq.${status}`)
  }

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data: campaigns, error } = await query

  if (error) {
    console.error('Campaigns query error:', error)
    return NextResponse.json({ data: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: campaigns || [], error: null })
}
