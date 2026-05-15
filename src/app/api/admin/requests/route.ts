import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // urgent를 상단 고정
  const sorted = (data || []).sort((a: any, b: any) => {
    if (a.urgency === 'urgent' && b.urgency !== 'urgent') return -1
    if (a.urgency !== 'urgent' && b.urgency === 'urgent') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({ data: sorted })
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabase()
  const body = await request.json()
  const { ids, status, reject_reason, vendor, amount, purchase_date, memo,
          delivery_photo_urls, receipt_photo_urls } = body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
  }

  const updateData: any = {}
  if (status) updateData.status = status
  if (reject_reason !== undefined) updateData.reject_reason = reject_reason
  if (vendor !== undefined) updateData.vendor = vendor
  if (amount !== undefined) updateData.amount = amount
  if (purchase_date !== undefined) updateData.purchase_date = purchase_date
  if (memo !== undefined) updateData.memo = memo
  if (delivery_photo_urls !== undefined) updateData.delivery_photo_urls = delivery_photo_urls
  if (receipt_photo_urls !== undefined) updateData.receipt_photo_urls = receipt_photo_urls

  const { data, error } = await supabase
    .from('requests')
    .update(updateData)
    .in('id', ids)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
