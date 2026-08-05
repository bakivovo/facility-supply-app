import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await request.json()
    const { input_by, item_name, spec, quantity, used_date, used_location, note } = body

    if (!input_by || !item_name || !quantity || !used_date) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('consumption_records')
      .insert({
        item_name,
        spec: spec || null,
        quantity: Number(quantity) || 1,
        used_date,
        used_location: used_location || null,
        status: 'pending',
        input_by,
        input_at: new Date().toISOString(),
        note: note || null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('소모내역 등록 오류:', err)
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const month  = searchParams.get('month')  // "YYYY-MM"

  let query = supabase
    .from('consumption_records')
    .select('*')
    .order('used_date', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (month) {
    const [y, m] = month.split('-')
    const year = parseInt(y, 10), mon = parseInt(m, 10)
    const thisMonthStr = `${y}-${m}-01`
    const nextMonthStr = mon === 12 ? `${year + 1}-01-01` : `${y}-${String(mon + 1).padStart(2, '0')}-01`
    query = query.gte('used_date', thisMonthStr).lt('used_date', nextMonthStr)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const body = await request.json()
  const { ids, item_name, spec, quantity, used_date, used_location, note, status, confirmed_by, confirmed_at } = body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
  }

  const updateData: any = {}
  if (item_name !== undefined) updateData.item_name = item_name
  if (spec !== undefined) updateData.spec = spec
  if (quantity !== undefined) updateData.quantity = quantity
  if (used_date !== undefined) updateData.used_date = used_date
  if (used_location !== undefined) updateData.used_location = used_location
  if (note !== undefined) updateData.note = note
  if (status !== undefined) updateData.status = status
  if (confirmed_by !== undefined) updateData.confirmed_by = confirmed_by
  if (confirmed_at !== undefined) updateData.confirmed_at = confirmed_at

  const { data, error } = await supabase
    .from('consumption_records')
    .update(updateData)
    .in('id', ids)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
