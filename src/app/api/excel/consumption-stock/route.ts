import { NextRequest } from 'next/server'
import { buildConsumptionStockWorkbook } from '@/lib/excelConsumptionStock'
import { fetchInventoryItems } from '@/lib/inventory'
import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { xlsxResponse } from '@/lib/excelHelpers'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const year  = parseInt(searchParams.get('year') || '', 10)
    const month = parseInt(searchParams.get('month') || '', 10)
    if (!year || !month || month < 1 || month > 12) {
      return Response.json({ error: 'year, month 파라미터가 올바르지 않습니다.' }, { status: 400 })
    }

    const thisMonthStr = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonthStr = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const supabase = getSupabaseAdmin()
    const [consRes, items] = await Promise.all([
      supabase
        .from('consumption_records')
        .select('*')
        .gte('used_date', thisMonthStr)
        .lt('used_date', nextMonthStr)
        .order('used_date', { ascending: true }),
      fetchInventoryItems(supabase),
    ])
    if (consRes.error) return Response.json({ error: consRes.error.message }, { status: 500 })

    const workbook = buildConsumptionStockWorkbook(consRes.data || [], items, year, month)
    const buffer = await workbook.xlsx.writeBuffer()
    return xlsxResponse(buffer, `소모내역_${year}년${month}월.xlsx`)
  } catch (err: any) {
    console.error('[excel/consumption-stock] 엑셀 생성 오류:', err?.stack ?? err)
    return Response.json({ error: err?.message ?? '알 수 없는 오류' }, { status: 500 })
  }
}
