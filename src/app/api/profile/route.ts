import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateProfileSchema, validateBody, formatZodError } from '@/lib/validation'

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = validateBody(updateProfileSchema, body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: formatZodError(validation.error) },
      { status: 400 }
    )
  }

  const { full_name, avatar_url } = validation.data

  const updates: Record<string, string | undefined> = {}
  if (full_name !== undefined) updates.full_name = full_name
  if (avatar_url !== undefined) updates.avatar_url = avatar_url

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Also update auth metadata
  if (full_name !== undefined) {
    await supabase.auth.updateUser({
      data: { full_name }
    })
  }

  return NextResponse.json({ success: true })
}
