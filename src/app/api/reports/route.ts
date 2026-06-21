import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createReportSchema, validateBody, formatZodError } from '@/lib/validation'
import {
  generateCampaignSummaryReport,
  generatePerformanceReport,
  generateInsightsReport,
  generateAlertsReport,
  generateRecommendationsReport,
  generateForecastsReport,
  getReportFilename,
} from '@/lib/reports'

export async function GET(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const workspaceId = searchParams.get('workspace_id')

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 })
  }

  const { data: reports } = await supabase
    .from('campaign_reports')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ reports: reports || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = validateBody(createReportSchema, body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: formatZodError(validation.error) },
      { status: 400 }
    )
  }

  const { workspace_id, report_type, format, title, description, filters } = validation.data

  // Verify access
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Create report record
  const { data: reportRecord, error: insertError } = await supabase
    .from('campaign_reports')
    .insert({
      workspace_id: workspace_id,
      user_id: user.id,
      report_type,
      format,
      title: title || `${report_type} Report`,
      description,
      filters: filters || {},
      status: 'generating',
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Get connections
  const { data: connections } = await supabase
    .from('meta_connections')
    .select('id')
    .eq('workspace_id', workspace_id)

  if (!connections || connections.length === 0) {
    await supabase.from('campaign_reports').update({ status: 'failed', error_message: 'No connections' }).eq('id', reportRecord.id)
    return NextResponse.json({ error: 'No connections found' }, { status: 400 })
  }

  const connectionIds = connections.map((c) => c.id)

  try {
    let csvContent = ''
    let rowCount = 0

    // Fetch data based on report type
    switch (report_type) {
      case 'campaign_summary': {
        const { data: campaigns } = await supabase
          .from('meta_campaigns')
          .select('id, campaign_id, name, status, effective_status, objective')
          .in('meta_connection_id', connectionIds)

        let query = supabase
          .from('meta_insights')
          .select('*')
          .in('meta_connection_id', connectionIds)
          .eq('entity_type', 'campaign')

        if (filters?.start_date) query = query.gte('date', filters.start_date)
        if (filters?.end_date) query = query.lte('date', filters.end_date)

        const { data: insightsData } = await query

        const insightMap: Record<string, { impressions: number; clicks: number; spend: number; conversions: number; purchase_value: number; reach: number }> = {}
        insightsData?.forEach((ins) => {
          const key = ins.entity_id_meta
          if (!insightMap[key]) {
            insightMap[key] = { impressions: 0, clicks: 0, spend: 0, conversions: 0, purchase_value: 0, reach: 0 }
          }
          insightMap[key].impressions += ins.impressions || 0
          insightMap[key].clicks += ins.clicks || 0
          insightMap[key].spend += ins.spend || 0
          insightMap[key].conversions += ins.conversions || 0
          insightMap[key].purchase_value += ins.purchase_value || 0
          insightMap[key].reach += ins.reach || 0
        })

        const result = generateCampaignSummaryReport(campaigns || [], insightMap)
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      case 'performance': {
        let query = supabase
          .from('meta_insights')
          .select('*')
          .in('meta_connection_id', connectionIds)
          .eq('entity_type', 'campaign')
          .order('date', { ascending: true })

        if (filters?.start_date) query = query.gte('date', filters.start_date)
        if (filters?.end_date) query = query.lte('date', filters.end_date)

        const { data: insightsData } = await query

        const byDate: Record<string, { date: string; spend: number; revenue: number; purchase_value: number; clicks: number; impressions: number; conversions: number; purchases: number }> = {}
        insightsData?.forEach((ins) => {
          const date = ins.date
          if (!byDate[date]) {
            byDate[date] = { date, spend: 0, revenue: 0, purchase_value: 0, clicks: 0, impressions: 0, conversions: 0, purchases: 0 }
          }
          byDate[date].spend += ins.spend || 0
          byDate[date].revenue += ins.purchase_value || 0
          byDate[date].purchase_value += ins.purchase_value || 0
          byDate[date].clicks += ins.clicks || 0
          byDate[date].impressions += ins.impressions || 0
          byDate[date].conversions += ins.conversions || 0
          byDate[date].purchases += ins.purchases || 0
        })

        const timeSeries = Object.values(byDate).sort((a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        const result = generatePerformanceReport(timeSeries)
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      case 'insights': {
        let query = supabase
          .from('meta_insights')
          .select('*, campaign:meta_campaigns(name)')
          .in('meta_connection_id', connectionIds)
          .eq('entity_type', 'campaign')
          .order('date', { ascending: false })

        if (filters?.start_date) query = query.gte('date', filters.start_date)
        if (filters?.end_date) query = query.lte('date', filters.end_date)
        if (filters?.limit) query = query.limit(filters.limit as number)
        else query = query.limit(10000)

        const { data: insightsData } = await query

        const result = generateInsightsReport(insightsData || [])
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      case 'alerts': {
        const { data: alertsData } = await supabase
          .from('campaign_alerts')
          .select('*, campaign:meta_campaigns(name)')
          .eq('workspace_id', workspace_id)
          .order('created_at', { ascending: false })
          .limit(5000)

        const result = generateAlertsReport(alertsData || [])
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      case 'recommendations': {
        const { data: recsData } = await supabase
          .from('campaign_recommendations')
          .select('*, campaign:meta_campaigns(name)')
          .eq('workspace_id', workspace_id)
          .order('created_at', { ascending: false })
          .limit(5000)

        const result = generateRecommendationsReport(recsData || [])
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      case 'forecasts': {
        const { data: forecastsData } = await supabase
          .from('campaign_forecasts')
          .select('*, campaign:meta_campaigns(name)')
          .eq('workspace_id', workspace_id)
          .order('generated_at', { ascending: false })
          .limit(5000)

        const result = generateForecastsReport(forecastsData || [])
        csvContent = result.csv
        rowCount = result.rows
        break
      }

      default:
        await supabase.from('campaign_reports').update({ status: 'failed', error_message: 'Unknown report type' }).eq('id', reportRecord.id)
        return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
    }

    // Update report as completed
    await supabase.from('campaign_reports').update({
      status: 'completed',
      generated_at: new Date().toISOString(),
    }).eq('id', reportRecord.id)

    const filename = getReportFilename(report_type, format)

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': format === 'csv' ? 'text/csv' : 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Report generation failed'
    await supabase.from('campaign_reports').update({
      status: 'failed',
      error_message: message,
    }).eq('id', reportRecord.id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
