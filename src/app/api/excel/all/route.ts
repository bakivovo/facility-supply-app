import ExcelJS from 'exceljs'
import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { xlsxResponse } from '@/lib/excelHelpers'

export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data: rows } = await supabase
      .from('requests')
      .select('*')
      .order('created_at', { ascending: false })

    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('전체이력')

    ws.columns = [
      { key: 'receipt_number', header: '접수번호',  width: 20 },
      { key: 'created_at',     header: '접수일시',  width: 18 },
      { key: 'requester_name', header: '요청자',    width: 10 },
      { key: 'category',       header: '카테고리',  width: 14 },
      { key: 'item_name',      header: '물품명',    width: 20 },
      { key: 'spec',           header: '규격',      width: 16 },
      { key: 'quantity',       header: '수량',      width:  8 },
      { key: 'unit',           header: '단위',      width:  8 },
      { key: 'urgency',        header: '긴급도',    width: 10 },
      { key: 'status',         header: '상태',      width: 10 },
      { key: 'vendor',         header: '구입처',    width: 14 },
      { key: 'purchase_date',  header: '구입일',    width: 12 },
      { key: 'amount',         header: '금액(원)',  width: 12 },
      { key: 'shipping_fee',   header: '배송비(원)', width: 12 },
      { key: 'total',          header: '합계(원)',  width: 12 },
      { key: 'memo',           header: '메모',      width: 20 },
      { key: 'purpose',        header: '요청사유',  width: 24 },
      { key: 'reject_reason',  header: '반려사유',  width: 20 },
    ]

    const urgencyLabel: Record<string, string> = { normal: '일반', urgent: '긴급', relaxed: '여유' }
    const statusLabel: Record<string, string>  = { new: '신규', reviewing: '검토중', ordered: '주문완료', settled: '정산완료', rejected: '반려' }

    ws.getRow(1).eachCell(cell => {
      cell.font      = { bold: true }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    for (const r of rows || []) {
      ws.addRow({
        receipt_number: r.receipt_number,
        created_at:     r.created_at?.replace('T', ' ').slice(0, 16),
        requester_name: r.requester_name,
        category:       r.category,
        item_name:      r.item_name,
        spec:           r.spec,
        quantity:       r.quantity,
        unit:           r.unit,
        urgency:        urgencyLabel[r.urgency] || r.urgency,
        status:         statusLabel[r.status]   || r.status,
        vendor:         r.vendor,
        purchase_date:  r.purchase_date,
        amount:         r.amount,
        shipping_fee:   r.shipping_fee,
        total:          (r.amount || 0) + (r.shipping_fee || 0) || null,
        memo:           r.memo,
        purpose:        r.purpose,
        reject_reason:  r.reject_reason,
      })
    }

    const buffer   = await workbook.xlsx.writeBuffer()
    const filename = `전체이력_${new Date().toISOString().slice(0, 10)}.xlsx`

    return xlsxResponse(buffer, filename)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
