import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateAlertSchema, validateBody, formatZodError } from '@/lib/validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = validateBody(updateAlertSchema, body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: formatZodError(validation.error) },
      { status: 400 }
    )
  }

  const { status } = validation.data

  const updates: Record<string, string | null> = { status }
  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString()
  } else if (status === 'dismissed') {
    updates.dismissed_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('campaign_alerts')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
