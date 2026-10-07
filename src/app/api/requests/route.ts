import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextRequest, NextResponse } from 'next/server'

async function generateReceiptNumber(categoryCode: string): Promise<string> {
  const supabase = getSupabaseAdmin()
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
    const supabase = getSupabaseAdmin()
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

// 신청자 본인 수정 — 신규(new) 상태일 때만 물품명·규격·수량 변경 허용
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { receipt_number, item_name, spec, quantity } = await request.json()

    if (!receipt_number) {
      return NextResponse.json({ error: '접수번호가 필요합니다.' }, { status: 400 })
    }
    const name = typeof item_name === 'string' ? item_name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: '물품명을 입력해주세요.' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1) {
      return NextResponse.json({ error: '수량은 1 이상이어야 합니다.' }, { status: 400 })
    }

    // status='new' 조건을 UPDATE에 포함시켜 검토 시작과의 경합에서도 안전하게 차단
    const { data, error } = await supabase
      .from('requests')
      .update({
        item_name: name,
        spec: typeof spec === 'string' && spec.trim() ? spec.trim() : null,
        quantity: qty,
      })
      .eq('receipt_number', String(receipt_number).trim())
      .eq('status', 'new')
      .select('receipt_number, status, item_name, spec, quantity, unit')

    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: '신규 상태의 요청만 수정할 수 있습니다. 이미 검토가 시작되었을 수 있습니다.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ success: true, data: data[0] })
  } catch (err: any) {
    console.error('요청 수정 오류:', err)
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
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
