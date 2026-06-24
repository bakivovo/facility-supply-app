import { NextRequest } from 'next/server'
import { buildSettlementWorkbook } from '@/lib/excelSettlement'
import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { makeDateStr, xlsxResponse } from '@/lib/excelHelpers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    if (!month) return Response.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 })

    const [year, mon] = month.split('-')

    // 다음 달 1일을 상한으로 사용 (월말 일수 차이 문제 회피)
    const nextMonth = new Date(parseInt(year), parseInt(mon), 1)
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .gte('created_at', `${year}-${mon}-01`)
      .lt('created_at', nextMonthStr)
      .eq('status', 'settled')
      .order('purchase_date', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const items   = data || []
    console.log(`[excel/monthly] ${month} 조회 건수: ${items.length}`)

    const dateStr = makeDateStr(new Date())
    const title   = `${year}년 ${parseInt(mon)}월 정산내역 (${items.length}건) — ${dateStr} / 동양미래대학교 사무처 시설관리팀`

    const workbook = await buildSettlementWorkbook(items, title)
    const buffer   = await workbook.xlsx.writeBuffer()

    return xlsxResponse(buffer, `${year.slice(2)}${mon}_정산현황.xlsx`)
  } catch (err: any) {
    console.error('[excel/monthly] 엑셀 생성 오류:', err?.stack ?? err)
    return Response.json({ error: err?.message ?? '알 수 없는 오류' }, { status: 500 })
  }
}
