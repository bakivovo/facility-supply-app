import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('display_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const body = await request.json()
  const { name, code } = body

  const { data: existing } = await supabase
    .from('categories')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0 ? existing[0].display_order + 1 : 1

  const { data, error } = await supabase
    .from('categories')
    .insert({ name, code, display_order: nextOrder })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PUT(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const body = await request.json()
  const { id, name, code, display_order } = body

  const { data, error } = await supabase
    .from('categories')
    .update({ name, code, display_order })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { error } = await supabase.from('categories').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
