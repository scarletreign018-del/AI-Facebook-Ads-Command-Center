export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  sources?: DataSource[]
}

export interface DataSource {
  type: 'campaign' | 'insight' | 'health_score' | 'recommendation' | 'forecast'
  entityId: string
  entityName: string
  metric?: string
  value?: number
}

interface CampaignRecord {
  id: string
  campaign_id: string
  name: string
  status: string
  effective_status?: string
}

interface InsightRecord {
  spend: number
  purchase_value: number
  conversions: number
  clicks: number
  impressions: number
}

interface TimeSeriesRecord {
  spend?: number
  purchase_value?: number
  revenue?: number
}

interface CampaignContext {
  campaigns: CampaignRecord[]
  insights: Record<string, InsightRecord>
  healthScores?: Record<string, unknown>
  timeSeries: TimeSeriesRecord[]
}

interface MetricResult {
  campaign: CampaignRecord
  value: number
  insight: InsightRecord
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function extractCampaignMentions(query: string, campaigns: CampaignRecord[]): CampaignRecord[] {
  const lower = query.toLowerCase()
  return campaigns.filter((c) =>
    lower.includes(c.name.toLowerCase()) ||
    lower.includes(c.campaign_id.toLowerCase())
  )
}

function getTopCampaignsByMetric(
  campaigns: CampaignRecord[],
  insights: Record<string, InsightRecord>,
  metric: 'roas' | 'spend' | 'ctr' | 'cpa' | 'conversions',
  limit: number = 5
): MetricResult[] {
  const withMetrics = campaigns
    .map((c) => {
      const ins = insights[c.campaign_id]
      if (!ins) return null

      let value = 0
      switch (metric) {
        case 'roas':
          value = ins.spend > 0 ? (ins.purchase_value || 0) / ins.spend : 0
          break
        case 'spend':
          value = ins.spend || 0
          break
        case 'ctr':
          value = ins.impressions > 0 ? (ins.clicks / ins.impressions) * 100 : 0
          break
        case 'cpa':
          value = ins.conversions > 0 ? ins.spend / ins.conversions : 0
          break
        case 'conversions':
          value = ins.conversions || 0
          break
      }

      return { campaign: c, value, insight: ins }
    })
    .filter((item): item is MetricResult => item !== null)

  const sorted = metric === 'cpa'
    ? withMetrics.sort((a, b) => a.value - b.value)
    : withMetrics.sort((a, b) => b.value - a.value)

  return sorted.slice(0, limit)
}

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toFixed(0)
}

function formatPercent(num: number): string {
  return `${num.toFixed(2)}%`
}

export function processChatQuery(query: string, context: CampaignContext): {
  response: string
  sources: DataSource[]
} {
  const lower = query.toLowerCase()
  const { campaigns, insights, timeSeries } = context

  const mentioned = extractCampaignMentions(query, campaigns)
  const sources: DataSource[] = []

  if (lower.includes('overview') || lower.includes('summary') || lower.includes('how are')) {
    const totalSpend = Object.values(insights).reduce((sum: number, i) => sum + (i?.spend || 0), 0)
    const totalRevenue = Object.values(insights).reduce((sum: number, i) => sum + (i?.purchase_value || 0), 0)
    const totalConversions = Object.values(insights).reduce((sum: number, i) => sum + (i?.conversions || 0), 0)
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const activeCampaigns = campaigns.filter((c) =>
      c.status === 'ACTIVE' || c.effective_status === 'ACTIVE'
    ).length

    campaigns.forEach((c) => {
      sources.push({ type: 'campaign', entityId: c.campaign_id, entityName: c.name })
    })

    return {
      response: `Here's your campaign overview:\n\n` +
        `- **Total Spend:** ${formatCurrency(totalSpend)}\n` +
        `- **Total Revenue:** ${formatCurrency(totalRevenue)}\n` +
        `- **Average ROAS:** ${avgRoas.toFixed(2)}x\n` +
        `- **Total Conversions:** ${formatNumber(totalConversions)}\n` +
        `- **Active Campaigns:** ${activeCampaigns} of ${campaigns.length}\n\n` +
        `${avgRoas >= 2 ? 'Strong overall performance!' : avgRoas >= 1 ? 'Moderate performance - room for optimization.' : 'Performance below targets - review underperforming campaigns.'}`,
      sources,
    }
  }

  if (lower.includes('top') || lower.includes('best') || lower.includes('performing')) {
    const metric = lower.includes('roas') ? 'roas' :
      lower.includes('spend') ? 'spend' :
      lower.includes('ctr') ? 'ctr' :
      lower.includes('conversion') ? 'conversions' : 'roas'

    const top = getTopCampaignsByMetric(campaigns, insights, metric, 5)

    top.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric, value: t.value })
    })

    const lines = top.map((t, i: number) => {
      const val = metric === 'roas' ? `${t.value.toFixed(2)}x` :
        metric === 'spend' ? formatCurrency(t.value) :
        metric === 'ctr' ? formatPercent(t.value) :
        metric === 'conversions' ? formatNumber(t.value) :
        t.value.toFixed(2)
      return `${i + 1}. **${t.campaign.name}** - ${val}`
    })

    return {
      response: `Here are the top ${top.length} campaigns by **${metric.toUpperCase()}**:\n\n${lines.join('\n')}\n\n` +
        `These campaigns are your best performers. Consider increasing budgets on the top ones to scale results.`,
      sources,
    }
  }

  if (lower.includes('worst') || lower.includes('underperform') || lower.includes('poor')) {
    const metric = lower.includes('roas') ? 'roas' :
      lower.includes('cpa') ? 'cpa' :
      lower.includes('ctr') ? 'ctr' : 'roas'

    const top = getTopCampaignsByMetric(campaigns, insights, metric, 10)
    const worst = metric === 'cpa' ? top.slice(-5).reverse() : top.slice(0, 5).reverse()

    worst.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric, value: t.value })
    })

    const lines = worst.map((t, i: number) => {
      const val = metric === 'roas' ? `${t.value.toFixed(2)}x` :
        metric === 'cpa' ? formatCurrency(t.value) :
        metric === 'ctr' ? formatPercent(t.value) :
        t.value.toFixed(2)
      return `${i + 1}. **${t.campaign.name}** - ${val}`
    })

    return {
      response: `Here are the underperforming campaigns by **${metric.toUpperCase()}**:\n\n${lines.join('\n')}\n\n` +
        `Consider pausing or restructuring these campaigns to improve efficiency.`,
      sources,
    }
  }

  if (lower.includes('roas')) {
    const totalSpend = Object.values(insights).reduce((sum: number, i) => sum + (i?.spend || 0), 0)
    const totalRevenue = Object.values(insights).reduce((sum: number, i) => sum + (i?.purchase_value || 0), 0)
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const topRoas = getTopCampaignsByMetric(campaigns, insights, 'roas', 3)

    topRoas.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric: 'roas', value: t.value })
    })

    return {
      response: `Your average ROAS is **${avgRoas.toFixed(2)}x** across all campaigns.\n\n` +
        `Top performers:\n` +
        topRoas.map((t) => `- **${t.campaign.name}**: ${t.value.toFixed(2)}x`).join('\n') +
        `\n\n${avgRoas >= 2 ? 'This is a strong ROAS. Consider scaling your top performers.' : avgRoas >= 1 ? 'Breaking even - focus on optimizing underperformers.' : 'Below break-even - immediate attention needed on targeting and creative.'}`,
      sources,
    }
  }

  if (lower.includes('cpa') || lower.includes('cost per')) {
    const totalSpend = Object.values(insights).reduce((sum: number, i) => sum + (i?.spend || 0), 0)
    const totalConversions = Object.values(insights).reduce((sum: number, i) => sum + (i?.conversions || 0), 0)
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0

    const bestCpa = getTopCampaignsByMetric(campaigns, insights, 'cpa', 3)

    bestCpa.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric: 'cpa', value: t.value })
    })

    return {
      response: `Your average CPA is **${formatCurrency(avgCpa)}** across all campaigns.\n\n` +
        `Best CPA performers (lowest cost):\n` +
        bestCpa.map((t) => `- **${t.campaign.name}**: ${formatCurrency(t.value)}`).join('\n') +
        `\n\n${avgCpa <= 25 ? 'Excellent CPA efficiency!' : avgCpa <= 50 ? 'Good CPA - monitor for optimization opportunities.' : 'High CPA - review audience targeting and landing page experience.'}`,
      sources,
    }
  }

  if (lower.includes('spend') || lower.includes('budget') || lower.includes('cost')) {
    const totalSpend = Object.values(insights).reduce((sum: number, i) => sum + (i?.spend || 0), 0)
    const topSpend = getTopCampaignsByMetric(campaigns, insights, 'spend', 5)

    topSpend.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric: 'spend', value: t.value })
    })

    return {
      response: `Total spend across all campaigns: **${formatCurrency(totalSpend)}**\n\n` +
        `Top spending campaigns:\n` +
        topSpend.map((t) => `- **${t.campaign.name}**: ${formatCurrency(t.value)}`).join('\n') +
        `\n\nReview if your highest-spend campaigns are also your highest-performing ones.`,
      sources,
    }
  }

  if (lower.includes('ctr') || lower.includes('click') || lower.includes('engagement')) {
    const totalClicks = Object.values(insights).reduce((sum: number, i) => sum + (i?.clicks || 0), 0)
    const totalImpressions = Object.values(insights).reduce((sum: number, i) => sum + (i?.impressions || 0), 0)
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    const topCtr = getTopCampaignsByMetric(campaigns, insights, 'ctr', 5)

    topCtr.forEach((t) => {
      sources.push({ type: 'insight', entityId: t.campaign.campaign_id, entityName: t.campaign.name, metric: 'ctr', value: t.value })
    })

    return {
      response: `Your average CTR is **${formatPercent(avgCtr)}** across all campaigns.\n\n` +
        `Top CTR campaigns:\n` +
        topCtr.map((t) => `- **${t.campaign.name}**: ${formatPercent(t.value)}`).join('\n') +
        `\n\n${avgCtr >= 1 ? 'Good engagement! Your ads are resonating with the audience.' : avgCtr >= 0.5 ? 'Average CTR - test new creatives to improve.' : 'Low CTR - your ads may not be compelling enough. Test new headlines, images, and CTAs.'}`,
      sources,
    }
  }

  if (mentioned.length > 0) {
    const campaign = mentioned[0]
    const ins = insights[campaign.campaign_id]

    if (!ins) {
      return {
        response: `I don't have performance data for "${campaign.name}" yet. Make sure the campaign has been synced recently.`,
        sources: [{ type: 'campaign', entityId: campaign.campaign_id, entityName: campaign.name }],
      }
    }

    const roas = ins.spend > 0 ? (ins.purchase_value || 0) / ins.spend : 0
    const cpa = ins.conversions > 0 ? ins.spend / ins.conversions : 0
    const ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions) * 100 : 0

    sources.push({ type: 'campaign', entityId: campaign.campaign_id, entityName: campaign.name })
    sources.push({ type: 'insight', entityId: campaign.campaign_id, entityName: campaign.name, metric: 'roas', value: roas })

    return {
      response: `Here's the performance for **"${campaign.name}"**:\n\n` +
        `- **Status:** ${campaign.status}${campaign.effective_status ? ` (${campaign.effective_status})` : ''}\n` +
        `- **Spend:** ${formatCurrency(ins.spend || 0)}\n` +
        `- **Revenue:** ${formatCurrency(ins.purchase_value || 0)}\n` +
        `- **ROAS:** ${roas.toFixed(2)}x\n` +
        `- **CPA:** ${cpa > 0 ? formatCurrency(cpa) : 'N/A'}\n` +
        `- **CTR:** ${ctr.toFixed(2)}%\n` +
        `- **Conversions:** ${formatNumber(ins.conversions || 0)}\n` +
        `- **Impressions:** ${formatNumber(ins.impressions || 0)}\n\n` +
        `${roas >= 2 ? 'This campaign is performing well. Consider increasing budget.' : roas >= 1 ? 'Breaking even - optimize for better returns.' : 'Underperforming - review targeting and creative.'}`,
      sources,
    }
  }

  if (lower.includes('trend') || lower.includes('change') || lower.includes('over time')) {
    if (!timeSeries || timeSeries.length < 14) {
      return {
        response: `I need at least 14 days of data to analyze trends. Currently, I have ${timeSeries?.length || 0} days of data. Please sync more historical data.`,
        sources: [],
      }
    }

    const recent = timeSeries.slice(-7)
    const previous = timeSeries.slice(-14, -7)

    const recentSpend = recent.reduce((sum: number, d) => sum + (d.spend || 0), 0)
    const previousSpend = previous.reduce((sum: number, d) => sum + (d.spend || 0), 0)
    const spendChange = previousSpend > 0 ? ((recentSpend - previousSpend) / previousSpend) * 100 : 0

    const recentRevenue = recent.reduce((sum: number, d) => sum + (d.purchase_value || d.revenue || 0), 0)
    const previousRevenue = previous.reduce((sum: number, d) => sum + (d.purchase_value || d.revenue || 0), 0)
    const revenueChange = previousRevenue > 0 ? ((recentRevenue - previousRevenue) / previousRevenue) * 100 : 0

    return {
      response: `Week-over-week trend analysis (last 7 days vs previous 7 days):\n\n` +
        `- **Spend:** ${spendChange > 0 ? '+' : ''}${spendChange.toFixed(1)}% (${formatCurrency(recentSpend)} vs ${formatCurrency(previousSpend)})\n` +
        `- **Revenue:** ${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}% (${formatCurrency(recentRevenue)} vs ${formatCurrency(previousRevenue)})\n\n` +
        `${revenueChange > spendChange ? 'Revenue is growing faster than spend - good efficiency trend!' : revenueChange < 0 ? 'Revenue declining - investigate causes.' : 'Stable performance week-over-week.'}`,
      sources: [],
    }
  }

  if (lower.includes('optimize') || lower.includes('improve') || lower.includes('suggestion') || lower.includes('recommend')) {
    const totalSpend = Object.values(insights).reduce((sum: number, i) => sum + (i?.spend || 0), 0)
    const totalRevenue = Object.values(insights).reduce((sum: number, i) => sum + (i?.purchase_value || 0), 0)
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0

    const topRoas = getTopCampaignsByMetric(campaigns, insights, 'roas', 3)
    const worstRoas = getTopCampaignsByMetric(campaigns, insights, 'roas', 10).slice(0, 3).reverse()

    topRoas.forEach((t) => {
      sources.push({ type: 'recommendation', entityId: t.campaign.campaign_id, entityName: t.campaign.name })
    })

    return {
      response: `Based on your campaign data, here are optimization suggestions:\n\n` +
        `**1. Scale Winners:**\n` +
        topRoas.map((t) => `   - Increase budget for "${t.campaign.name}" (${t.value.toFixed(2)}x ROAS)`).join('\n') +
        `\n\n**2. Fix Underperformers:**\n` +
        (worstRoas.length > 0 ? worstRoas.map((t) => `   - Review "${t.campaign.name}" (${t.value.toFixed(2)}x ROAS)`).join('\n') : '   - No severely underperforming campaigns found.') +
        `\n\n**3. General Tips:**\n` +
        `   - ${avgRoas >= 2 ? 'Your account is healthy. Focus on scaling.' : 'Test new audiences and creatives to improve ROAS.'}\n` +
        `   - Monitor frequency to avoid ad fatigue\n` +
        `   - A/B test landing pages to improve conversion rates`,
      sources,
    }
  }

  return {
    response: `I can help you analyze your Meta Ads campaigns. Here are some things you can ask:\n\n` +
      `- "Show me an overview of my campaigns"\n` +
      `- "What are my top performing campaigns?"\n` +
      `- "Which campaigns have the worst ROAS?"\n` +
      `- "What is my average CPA?"\n` +
      `- "How is [campaign name] performing?"\n` +
      `- "Show me spend trends"\n` +
      `- "Give me optimization suggestions"\n\n` +
      `All responses are based on your synchronized campaign data only.`,
    sources: [],
  }
}

export function createUserMessage(content: string): ChatMessage {
  return {
    id: generateId(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  }
}

export function createAssistantMessage(content: string, sources?: DataSource[]): ChatMessage {
  return {
    id: generateId(),
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    sources,
  }
}
