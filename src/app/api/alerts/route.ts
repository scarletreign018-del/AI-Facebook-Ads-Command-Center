import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateAlertSchema, validateBody, formatZodError } from '@/lib/validation'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspace_id')
  const status = searchParams.get('status')
  const severity = searchParams.get('severity')

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
  }

  let query = supabase
    .from('campaign_alerts')
    .select('*, campaign:meta_campaigns(name)')
    .eq('workspace_id', workspaceId)

  if (status) query = query.eq('status', status)
  if (severity) query = query.eq('severity', severity)

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: data || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { workspace_id, campaign_ids, date_range } = body

  if (!workspace_id) {
    return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
  }

  // Get connections
  const { data: connections } = await supabase
    .from('meta_connections')
    .select('id')
    .eq('workspace_id', workspace_id)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ alerts: [] })
  }

  const connectionIds = connections.map((c) => c.id)

  // Get campaigns
  let campaignQuery = supabase
    .from('meta_campaigns')
    .select('id, campaign_id, name, status, effective_status')
    .in('meta_connection_id', connectionIds)

  if (campaign_ids && campaign_ids.length > 0) {
    campaignQuery = campaignQuery.in('id', campaign_ids)
  }

  const { data: campaigns } = await campaignQuery

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ alerts: [] })
  }

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - (date_range || 7))

  const campaignIds = campaigns.map((c) => c.id)

  // Get insights for comparison
  const { data: currentInsights } = await supabase
    .from('meta_insights')
    .select('*')
    .in('campaign_id', campaignIds)
    .eq('entity_type', 'campaign')
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0])

  const { data: previousInsights } = await supabase
    .from('meta_insights')
    .select('*')
    .in('campaign_id', campaignIds)
    .eq('entity_type', 'campaign')
    .gte('date', new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .lte('date', startDate.toISOString().split('T')[0])

  // Generate alerts
  const alerts: Array<Record<string, unknown>> = []

  for (const campaign of campaigns) {
    const current = currentInsights?.filter((i) => i.campaign_id === campaign.id) || []
    const previous = previousInsights?.filter((i) => i.campaign_id === campaign.id) || []

    const currentSpend = current.reduce((sum, i) => sum + (i.spend || 0), 0)
    const previousSpend = previous.reduce((sum, i) => sum + (i.spend || 0), 0)
    const currentROAS = currentSpend > 0
      ? current.reduce((sum, i) => sum + (i.purchase_value || 0), 0) / currentSpend
      : 0
    const previousROAS = previousSpend > 0
      ? previous.reduce((sum, i) => sum + (i.purchase_value || 0), 0) / previousSpend
      : 0

    // ROAS Drop Alert
    if (previousROAS > 0 && currentROAS < previousROAS * 0.7) {
      alerts.push({
        campaign_id: campaign.id,
        workspace_id,
        alert_type: 'roas_drop',
        severity: currentROAS < previousROAS * 0.5 ? 'critical' : 'warning',
        title: `ROAS Drop: ${campaign.name}`,
        message: `ROAS dropped from ${previousROAS.toFixed(2)} to ${currentROAS.toFixed(2)}`,
        metric_name: 'roas',
        metric_value: currentROAS,
        threshold_value: previousROAS * 0.7,
        previous_value: previousROAS,
        status: 'active',
      })
    }

    // CPA Spike Alert
    const currentCPA = currentSpend > 0 && current.length > 0
      ? currentSpend / current.reduce((sum, i) => sum + (i.conversions || 0), 0)
      : 0
    const previousCPA = previousSpend > 0 && previous.length > 0
      ? previousSpend / previous.reduce((sum, i) => sum + (i.conversions || 0), 0)
      : 0

    if (previousCPA > 0 && currentCPA > previousCPA * 1.5) {
      alerts.push({
        campaign_id: campaign.id,
        workspace_id,
        alert_type: 'cpa_spike',
        severity: currentCPA > previousCPA * 2 ? 'critical' : 'warning',
        title: `CPA Spike: ${campaign.name}`,
        message: `CPA increased from $${previousCPA.toFixed(2)} to $${currentCPA.toFixed(2)}`,
        metric_name: 'cpa',
        metric_value: currentCPA,
        threshold_value: previousCPA * 1.5,
        previous_value: previousCPA,
        status: 'active',
      })
    }
  }

  // Insert alerts
  if (alerts.length > 0) {
    await supabase.from('campaign_alerts').insert(alerts)
  }

  return NextResponse.json({ alerts, generated: alerts.length })
}
