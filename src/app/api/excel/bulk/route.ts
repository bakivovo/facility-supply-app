import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSettlementWorkbook } from '@/lib/excelSettlement'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function makeDateStr(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .in('id', ids)
      .order('purchase_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items  = data || []
    const today  = new Date()
    const yyMM   = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}`
    const dateStr = makeDateStr(today)
    const title  = `선택 ${items.length}건 정산내역 — ${dateStr} / 동양미래대학교 사무처 시설관리팀`

    const workbook = await buildSettlementWorkbook(items, title)
    const buffer   = await workbook.xlsx.writeBuffer()
    const filename = encodeURIComponent(`${yyMM}_선택${items.length}건_정산현황.xlsx`)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err: any) {
    console.error('일괄 엑셀 생성 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
