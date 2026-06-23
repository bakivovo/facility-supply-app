import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const body = await request.json()
  const { name } = body

  const { data, error } = await supabase
    .from('vendors')
    .insert({ name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { error } = await supabase.from('vendors').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
