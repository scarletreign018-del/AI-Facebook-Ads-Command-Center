import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createWorkspaceSchema, validateBody, formatZodError } from '@/lib/validation'

export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      role,
      workspace:workspaces(*)
    `)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const validation = validateBody(createWorkspaceSchema, body)

  if (!validation.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: formatZodError(validation.error) },
      { status: 400 }
    )
  }

  const { name, slug } = validation.data

  // Create workspace (trigger will auto-create owner membership)
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .insert({ name, slug, owner_id: user.id })
    .select()
    .single()

  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 500 })
  }

  return NextResponse.json(workspace)
}
