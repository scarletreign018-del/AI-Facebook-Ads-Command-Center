/**
 * Sync Worker - Processes Meta API sync jobs
 */

import { Job } from 'bull'
import { syncQueue } from './queue'
import { createClient } from '@supabase/supabase-js'
import { logger } from '../logger'
import { createMetaClient } from '../meta/api-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SyncJobData {
  connectionId: string
  workspaceId: string
  syncType: 'full' | 'incremental' | 'insights_only'
  adAccountIds?: string[]
}

/**
 * Process sync jobs with retry logic
 */
syncQueue.process('meta-sync', async (job: Job<SyncJobData>) => {
  const { connectionId, workspaceId, syncType, adAccountIds } = job.data

  logger.info('Sync started', { connectionId, syncType })
  
  // Update progress
  job.progress(5)

  try {
    // 1. Fetch connection details with decrypted token
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('id', connectionId)
      .single()

    if (connError || !connection) {
      throw new Error(`Connection not found: ${connectionId}`)
    }

    // 2. Check token expiration
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      logger.warn('Token expired, attempting refresh', { connectionId })
      // TODO: Implement token refresh flow
      throw new Error('Token expired, refresh needed')
    }

    job.progress(10)

    // 3. Initialize Meta API client
    const accessToken = Buffer.from(connection.encrypted_access_token, 'base64').toString()
    const apiClient = createMetaClient(accessToken)

    // 4. Create sync log
    const { data: syncLog } = await supabase
      .from('meta_sync_logs')
      .insert({
        meta_connection_id: connectionId,
        sync_type: syncType,
        entity_type: 'all',
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (!syncLog) {
      throw new Error('Failed to create sync log')
    }

    let totalProcessed = 0

    // 5. Sync Business Managers (if full sync)
    if (syncType === 'full') {
      logger.info('Syncing business managers', { connectionId })
      const businessManagers = await apiClient.getBusinessManagers()
      
      for (const bm of businessManagers) {
        await supabase.from('meta_business_managers').upsert({
          meta_connection_id: connectionId,
          business_manager_id: bm.id,
          name: bm.name,
          profile_picture_url: bm.profile_picture_uri,
          is_active: true,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'meta_connection_id,business_manager_id',
        })
        totalProcessed++
      }
      
      job.progress(20)
    }

    // 6. Sync Ad Accounts
    logger.info('Syncing ad accounts', { connectionId })
    const adAccounts = await apiClient.getAdAccounts()
    
    for (const account of adAccounts) {
      await supabase.from('meta_ad_accounts').upsert({
        meta_connection_id: connectionId,
        ad_account_id: account.id,
        name: account.name,
        account_status: account.account_status,
        currency: account.currency,
        timezone_name: account.timezone_name,
        amount_spent: account.amount_spent,
        balance: account.balance,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      }, {
        onConflict: 'meta_connection_id,ad_account_id',
      })
      totalProcessed++
    }
    
    job.progress(30)

    // 7. Sync Campaigns for each ad account
    const accountsToSync = adAccountIds?.length
      ? adAccounts.filter(a => adAccountIds.includes(a.id))
      : adAccounts

    for (let i = 0; i < accountsToSync.length; i++) {
      const account = accountsToSync[i]
      logger.info('Syncing campaigns', { adAccountId: account.id })

      // Get internal ad account ID
      const { data: dbAccount } = await supabase
        .from('meta_ad_accounts')
        .select('id')
        .eq('ad_account_id', account.id)
        .single()

      if (!dbAccount) continue

      // Fetch campaigns with pagination
      let hasMore = true
      let after: string | undefined

      while (hasMore) {
        const response = await apiClient.getCampaigns(account.id, { after })
        const campaigns = response.data || []

        for (const campaign of campaigns) {
          await supabase.from('meta_campaigns').upsert({
            meta_connection_id: connectionId,
            ad_account_id: dbAccount.id,
            campaign_id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
            effective_status: campaign.effective_status,
            buying_type: campaign.buying_type,
            budget_remaining: campaign.budget_remaining,
            daily_budget: campaign.daily_budget,
            lifetime_budget: campaign.lifetime_budget,
            start_time: campaign.start_time,
            stop_time: campaign.stop_time,
            last_synced_at: new Date().toISOString(),
          }, {
            onConflict: 'ad_account_id,campaign_id',
          })
          totalProcessed++
        }

        // Check for pagination
        hasMore = !!response.paging?.next
        after = response.paging?.cursors?.after
      }

      job.progress(30 + ((i + 1) / accountsToSync.length) * 30)
    }

    // 8. Sync Insights (last 30 days)
    if (syncType !== 'insights_only') {
      job.progress(60)
    }

    logger.info('Syncing insights', { connectionId })
    
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const since = thirtyDaysAgo.toISOString().split('T')[0]
    const until = new Date().toISOString().split('T')[0]

    // Get all campaigns to sync insights
    const { data: campaignsToSync } = await supabase
      .from('meta_campaigns')
      .select('id, campaign_id')
      .eq('meta_connection_id', connectionId)

    if (campaignsToSync) {
      for (let i = 0; i < campaignsToSync.length; i++) {
        const campaign = campaignsToSync[i]
        
        try {
          const insightsResponse = await apiClient.getDailyInsights(campaign.campaign_id, {
            since,
            until,
          })

          const insights = insightsResponse.data || []

          for (const dailyInsight of insights) {
            // Extract action data
            const purchases = dailyInsight.actions?.find((a: any) => a.action_type === 'purchase')?.value || 0
            const purchaseValue = dailyInsight.action_values?.find((a: any) => a.action_type === 'purchase')?.value || 0

            await supabase.from('meta_insights').upsert({
              meta_connection_id: connectionId,
              entity_type: 'campaign',
              entity_id: campaign.id,
              entity_id_meta: campaign.campaign_id,
              date: dailyInsight.date_start,
              impressions: parseInt(dailyInsight.impressions || 0),
              clicks: parseInt(dailyInsight.clicks || 0),
              unique_clicks: parseInt(dailyInsight.unique_clicks || 0),
              spend: parseFloat(dailyInsight.spend || 0),
              reach: parseInt(dailyInsight.reach || 0),
              frequency: parseFloat(dailyInsight.frequency || 0),
              cpm: parseFloat(dailyInsight.cpm || 0),
              cpc: parseFloat(dailyInsight.cpc || 0),
              ctr: parseFloat(dailyInsight.ctr || 0),
              actions: dailyInsight.actions || [],
              conversions: parseInt(purchases),
              purchase_value: parseFloat(purchaseValue),
              purchases: parseInt(purchases),
              roas: purchaseValue > 0 && dailyInsight.spend > 0 ? parseFloat(purchaseValue) / parseFloat(dailyInsight.spend) : 0,
              last_synced_at: new Date().toISOString(),
            }, {
              onConflict: 'entity_type,entity_id_meta,date',
            })
            
            totalProcessed++
          }
        } catch (error) {
          logger.error('Failed to sync insights for campaign', error, { 
            campaignId: campaign.campaign_id 
          })
          // Continue with other campaigns
        }

        job.progress(60 + ((i + 1) / campaignsToSync.length) * 30)
      }
    }

    job.progress(95)

    // 9. Update sync log as completed
    await supabase
      .from('meta_sync_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed_records: totalProcessed,
        duration_seconds: Math.floor((Date.now() - new Date(syncLog.created_at).getTime()) / 1000),
      })
      .eq('id', syncLog.id)

    // 10. Update connection last_synced_at
    await supabase
      .from('meta_connections')
      .update({ 
        last_synced_at: new Date().toISOString(),
        status: 'active',
      })
      .eq('id', connectionId)

    job.progress(100)

    logger.info('Sync completed', { 
      connectionId, 
      totalProcessed,
      syncType,
    })

    return {
      success: true,
      connectionId,
      syncedAt: new Date().toISOString(),
      totalProcessed,
    }
  } catch (error) {
    logger.error('Sync failed', error, { connectionId })
    
    // Log failure
    await supabase
      .from('meta_sync_logs')
      .insert({
        meta_connection_id: connectionId,
        sync_type: syncType,
        entity_type: 'all',
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })

    // Update connection status
    await supabase
      .from('meta_connections')
      .update({ 
        status: 'error',
        last_error_message: error instanceof Error ? error.message : 'Sync failed',
      })
      .eq('id', connectionId)

    throw error // Bull will handle retries
  }
})

// Event listeners for monitoring
syncQueue.on('completed', (job, result) => {
  logger.info('Sync job completed', { jobId: job.id, result })
})

syncQueue.on('failed', (job, err) => {
  logger.error('Sync job failed', err, { jobId: job?.id })
})

syncQueue.on('stalled', (job) => {
  logger.warn('Sync job stalled', { jobId: job.id })
})

logger.info('Sync Worker started and ready to process jobs')

