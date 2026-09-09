import { NextRequest } from 'next/server'
import { buildInventoryConsumptionWorkbook } from '@/lib/excelInventoryConsumption'
import { getInventoryItems } from '@/lib/inventory'
import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { xlsxResponse } from '@/lib/excelHelpers'
import type { ConsumptionRecord } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    if (!yearParam || !monthParam) {
      return Response.json({ error: 'year, month 파라미터가 필요합니다.' }, { status: 400 })
    }

    const year = parseInt(yearParam, 10)
    const month = parseInt(monthParam, 10)

    const thisMonthStr = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonthStr = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    const supabase = getSupabaseAdmin()
    const [consRes, inventory] = await Promise.all([
      supabase
        .from('consumption_records')
        .select('*')
        .gte('used_date', thisMonthStr)
        .lt('used_date', nextMonthStr)
        .order('used_date', { ascending: true }),
      getInventoryItems(),
    ])

    if (consRes.error) return Response.json({ error: consRes.error.message }, { status: 500 })

    const records = (consRes.data || []) as ConsumptionRecord[]
    const workbook = buildInventoryConsumptionWorkbook(records, inventory, year, month)
    const buffer = await workbook.xlsx.writeBuffer()

    return xlsxResponse(buffer, `소모내역_${year}년${month}월.xlsx`)
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    console.error('[excel/inventory-consumption] 엑셀 생성 오류:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
