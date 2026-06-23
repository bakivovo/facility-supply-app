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

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .gte('created_at', `${year}-${mon}-01`)
      .lte('created_at', `${year}-${mon}-31`)
      .eq('status', 'settled')
      .order('purchase_date', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const items   = data || []
    const dateStr = makeDateStr(new Date())
    const title   = `${year}년 ${parseInt(mon)}월 정산내역 (${items.length}건) — ${dateStr} / 동양미래대학교 사무처 시설관리팀`

    const workbook = await buildSettlementWorkbook(items, title)
    const buffer   = await workbook.xlsx.writeBuffer()

    return xlsxResponse(buffer, `${year.slice(2)}${mon}_정산현황.xlsx`)
  } catch (err: any) {
    console.error('월별 정산 엑셀 오류:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
