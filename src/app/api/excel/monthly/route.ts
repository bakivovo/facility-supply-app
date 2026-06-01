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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 })

    const [year, mon] = month.split('-')

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .gte('created_at', `${year}-${mon}-01`)
      .lte('created_at', `${year}-${mon}-31`)
      .eq('status', 'settled')
      .order('purchase_date', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items   = data || []
    const dateStr = makeDateStr(new Date())
    const title   = `${year}년 ${parseInt(mon)}월 정산내역 (${items.length}건) — ${dateStr} / 동양미래대학교 사무처 시설관리팀`

    const workbook = await buildSettlementWorkbook(items, title)
    const buffer   = await workbook.xlsx.writeBuffer()
    const filename = encodeURIComponent(`${year.slice(2)}${mon}_정산현황.xlsx`)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err: any) {
    console.error('월별 정산 엑셀 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
