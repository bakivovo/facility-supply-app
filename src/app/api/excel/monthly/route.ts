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

    // 다음 달 1일 (created_at 범위의 상한 — '2026-06-31'처럼 존재하지 않는 날짜를 피하기 위해 lt 사용)
    const y = parseInt(year, 10), m = parseInt(mon, 10)
    const nextMonthStr = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    const thisMonthStr = `${year}-${mon}-01`

    const supabase = getSupabaseAdmin()
    // purchase_month 기준으로 집계 (이관된 건은 이관된 월로 포함).
    // purchase_month가 NULL인 건은 created_at이 해당 월에 속하면 포함 (fallback)
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('status', 'settled')
      .or(`purchase_month.eq.${month},and(purchase_month.is.null,created_at.gte.${thisMonthStr},created_at.lt.${nextMonthStr})`)
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
