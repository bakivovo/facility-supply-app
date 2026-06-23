import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('settings').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result: Record<string, string> = {}
  for (const row of data || []) {
    result[row.key] = row.value
  }
  return NextResponse.json({ data: result })
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const body = await request.json()
  const { key, value } = body

  const { error } = await supabase
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
