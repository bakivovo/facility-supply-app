import { NextRequest } from 'next/server'
import { buildSettlementWorkbook } from '@/lib/excelSettlement'
import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { makeDateStr, xlsxResponse } from '@/lib/excelHelpers'

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'ids가 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .in('id', ids)
      .order('purchase_date', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const items   = data || []
    const today   = new Date()
    const yyMM    = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}`
    const dateStr = makeDateStr(today)
    const title   = `선택 ${items.length}건 정산내역 — ${dateStr} / 동양미래대학교 사무처 시설관리팀`

    const workbook = await buildSettlementWorkbook(items, title)
    const buffer   = await workbook.xlsx.writeBuffer()

    return xlsxResponse(buffer, `${yyMM}_선택${items.length}건_정산현황.xlsx`)
  } catch (err: any) {
    console.error('일괄 엑셀 생성 오류:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
