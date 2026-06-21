/**
 * Shared validation schemas using Zod.
 * Used across API routes and forms.
 */

import { z } from 'zod'

// ============================================
// Common Schemas
// ============================================
export const uuidSchema = z.string().uuid()
export const emailSchema = z.string().email()
export const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')

// ============================================
// Workspace Schemas
// ============================================
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: slugSchema.optional(),
})

export const workspaceMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer']),
})

// ============================================
// Profile Schemas
// ============================================
export const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
})

// ============================================
// Saved Views Schemas
// ============================================
export const createSavedViewSchema = z.object({
  name: z.string().min(1).max(100),
  view_type: z.enum(['campaigns', 'adsets', 'ads', 'analytics']),
  columns: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
})

export const updateSavedViewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  columns: z.array(z.string()).optional(),
  filters: z.record(z.unknown()).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
})

// ============================================
// Report Schemas
// ============================================
export const createReportSchema = z.object({
  report_type: z.enum(['campaign_summary', 'performance', 'insights', 'health', 'recommendations', 'forecasts', 'alerts']),
  format: z.enum(['csv', 'excel', 'pdf']),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  filters: z.record(z.unknown()).optional(),
  date_range_start: z.string().datetime().optional(),
  date_range_end: z.string().datetime().optional(),
})

// ============================================
// Alert Schemas
// ============================================
export const updateAlertSchema = z.object({
  status: z.enum(['active', 'resolved', 'dismissed']),
})

// ============================================
// Recommendation Schemas
// ============================================
export const updateRecommendationSchema = z.object({
  status: z.enum(['pending', 'applied', 'dismissed', 'expired']),
})

// ============================================
// Notification Preferences Schemas
// ============================================
export const updateNotificationPrefsSchema = z.object({
  email_enabled: z.boolean().optional(),
  alert_email: z.boolean().optional(),
  report_email: z.boolean().optional(),
  campaign_issue_email: z.boolean().optional(),
  digest_frequency: z.enum(['realtime', 'daily', 'weekly', 'none']).optional(),
  quiet_hours_start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  quiet_hours_end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
})

// ============================================
// Sync Schemas
// ============================================
export const triggerSyncSchema = z.object({
  connection_id: uuidSchema,
  ad_account_id: uuidSchema.optional(),
  entity_type: z.enum(['all', 'business_managers', 'ad_accounts', 'campaigns', 'adsets', 'ads', 'insights']),
  sync_type: z.enum(['full', 'incremental', 'manual', 'scheduled']),
  days_back: z.number().int().min(1).max(365).optional(),
})

// ============================================
// Meta Connection Schemas
// ============================================
export const createMetaConnectionSchema = z.object({
  workspace_id: uuidSchema,
})

// ============================================
// AI Chat Schemas
// ============================================
export const chatMessageSchema = z.object({
  message: z.string().min(1).max(2000),
})

// ============================================
// Query Param Schemas
// ============================================
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export const dateRangeSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const searchSchema = z.object({
  q: z.string().max(200).optional(),
  status: z.string().optional(),
})

// ============================================
// Helper Functions
// ============================================
export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(body)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

export function validateQuery<T>(schema: z.ZodSchema<T>, query: Record<string, string | string[] | undefined>): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(query)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

export function formatZodError(error: z.ZodError): string {
  return error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
}
