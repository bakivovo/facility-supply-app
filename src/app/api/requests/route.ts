import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function generateReceiptNumber(categoryCode: string): Promise<string> {
  const supabase = getSupabase()
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `${yy}-${mm}-${categoryCode}`

  const { data } = await supabase
    .from('requests')
    .select('receipt_number')
    .like('receipt_number', `${prefix}-%`)
    .order('receipt_number', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (data && data.length > 0 && data[0].receipt_number) {
    const parts = data[0].receipt_number.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextNum = lastNum + 1
  }

  return `${prefix}-${String(nextNum).padStart(3, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const {
      requester_name, category, category_code, item_name, spec,
      quantity, unit, purchase_link, request_photos, purpose, urgency
    } = body

    if (!requester_name || !category || !item_name || !purpose || !urgency) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 })
    }

    const receipt_number = await generateReceiptNumber(category_code || '기타')

    const { data, error } = await supabase
      .from('requests')
      .insert({
        receipt_number,
        requester_name,
        category,
        item_name,
        spec: spec || null,
        quantity: Number(quantity) || 1,
        unit: unit || '개',
        purchase_link: purchase_link || null,
        request_photos: request_photos || null,
        purpose,
        urgency,
        status: 'new',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data, receipt_number })
  } catch (err: any) {
    console.error('요청 제출 오류:', err)
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const { searchParams } = new URL(request.url)
  const receipt_number  = searchParams.get('receipt_number')
  const autocomplete    = searchParams.get('autocomplete')
  const requester_name  = searchParams.get('requester_name')

  // 자동완성
  if (autocomplete) {
    const { data } = await supabase
      .from('requests')
      .select('item_name')
      .ilike('item_name', `%${autocomplete}%`)
      .limit(20)

    const names = [...new Set((data || []).map((r: any) => r.item_name))].slice(0, 5)
    return NextResponse.json({ items: names })
  }

  // 통합 검색 (이름 OR 물품명 OR 규격)
  const query = searchParams.get('query') || requester_name  // 하위 호환
  if (query) {
    const q = query.trim()
    const { data, error } = await supabase
      .from('requests')
      .select('receipt_number, status, reject_reason, item_name, spec, quantity, unit, purchase_quantity, unit_price, purchase_date, amount, vendor, purpose, created_at')
      .or(`requester_name.ilike.%${q}%,item_name.ilike.%${q}%,spec.ilike.%${q}%`)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  }

  // 접수번호로 단건 조회
  if (!receipt_number) {
    return NextResponse.json({ error: '접수번호를 입력해주세요.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('requests')
    .select('receipt_number, status, reject_reason, item_name, created_at, urgency, category')
    .eq('receipt_number', receipt_number.trim())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '해당 접수번호를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ data })
}
