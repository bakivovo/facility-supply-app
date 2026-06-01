import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STATUS_LABEL: Record<string, string> = {
  new: '신규', reviewing: '검토중', purchased: '구입완료', settled: '정산완료', rejected: '반려',
}

// ────────────────────────────────────────────────
// 헬퍼: 상세내역 시트 (Sheet 1)
// 컬럼 A~P (16열) — monthly 라우트와 동일 구조
// ────────────────────────────────────────────────
function buildDetailSheet(
  workbook: ExcelJS.Workbook,
  rows: any[],
  title: string,
  periodStr: string,
  adminName: string,
  dateStr: string,
) {
  const ws = workbook.addWorksheet('상세내역')
  ws.columns = [
    { key: 'receipt_number', width: 20 },  // A
    { key: 'created_at',     width: 14 },  // B
    { key: 'category',       width: 14 },  // C
    { key: 'item_name',      width: 20 },  // D
    { key: 'spec',           width: 14 },  // E
    { key: 'quantity',       width: 8  },  // F
    { key: 'unit_price',     width: 12 },  // G
    { key: 'amount',         width: 12 },  // H
    { key: 'shipping_fee',   width: 12 },  // I
    { key: 'total',          width: 12 },  // J
    { key: 'vendor',         width: 14 },  // K
    { key: 'purchase_date',  width: 12 },  // L
    { key: 'memo',           width: 20 },  // M
    { key: 'status',         width: 10 },  // N
    { key: 'requester_name', width: 10 },  // O
    { key: 'purpose',        width: 24 },  // P
  ]

  // 행1: 제목
  ws.mergeCells('A1:P1')
  const t = ws.getCell('A1')
  t.value = title
  t.font = { bold: true, size: 14 }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 36

  // 행2: 정산기간 / 담당자 / 출력일
  ws.mergeCells('A2:F2'); ws.getCell('A2').value = `정산기간: ${periodStr}`
  ws.mergeCells('G2:K2'); ws.getCell('G2').value = `담당자: ${adminName}`
  ws.mergeCells('L2:P2'); ws.getCell('L2').value = `출력일: ${dateStr}`
  ws.getRow(2).eachCell(cell => { cell.font = { size: 10 }; cell.alignment = { horizontal: 'left' } })
  ws.getRow(2).height = 18

  // 행3: 헤더
  ws.addRow(['접수번호', '접수일', '카테고리', '물품명', '규격', '수량', '단가(원)',
             '구입금액(원)', '배송비(원)', '합계(원)', '구입처', '구입일', '메모', '상태', '요청자', '요청사유'])
  ws.getRow(3).eachCell(cell => {
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // 행4~: 데이터
  const DATA_START = 4
  for (const r of rows) {
    const row = ws.addRow([
      r.receipt_number || '',
      r.created_at ? r.created_at.slice(0, 10) : '',
      r.category || '',
      r.item_name || '',
      r.spec || '',
      r.quantity || 0,
      r.unit_price || '',
      r.amount || '',
      r.shipping_fee || '',
      (r.amount || 0) + (r.shipping_fee || 0) || '',
      r.vendor || '',
      r.purchase_date || '',
      r.memo || '',
      STATUS_LABEL[r.status] || r.status,
      r.requester_name || '',
      r.purpose || '',
    ])
    row.eachCell((cell, col) => {
      cell.font = { size: 10 }
      cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
      cell.alignment = col >= 7 && col <= 10
        ? { horizontal: 'right', vertical: 'middle', wrapText: true }
        : { vertical: 'middle', wrapText: true }
      if (col >= 7 && col <= 10) cell.numFmt = '#,##0'
    })
  }

  // 합계행
  const lastData = DATA_START + rows.length - 1
  const sumRow = ws.addRow([
    '합계', '', '', '', '', '', '',
    { formula: `SUM(H${DATA_START}:H${lastData})` },
    { formula: `SUM(I${DATA_START}:I${lastData})` },
    { formula: `SUM(J${DATA_START}:J${lastData})` },
    '', '', '', '', '', '',
  ])
  ;[1, 8, 9, 10].forEach(col => { sumRow.getCell(col).font = { bold: true } })
  ;[8, 9, 10].forEach(col => { sumRow.getCell(col).numFmt = '#,##0'; sumRow.getCell(col).alignment = { horizontal: 'right' } })
  sumRow.eachCell(cell => {
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
}

// ────────────────────────────────────────────────
// 헬퍼: 카테고리집계 시트 (Sheet 2)
// ────────────────────────────────────────────────
function buildCategorySheet(workbook: ExcelJS.Workbook, rows: any[]) {
  const ws = workbook.addWorksheet('카테고리집계')
  ws.columns = [
    { key: 'category', width: 18 },
    { key: 'count',    width: 10 },
    { key: 'amount',   width: 14 },
    { key: 'shipping', width: 14 },
    { key: 'total',    width: 14 },
    { key: 'ratio',    width: 10 },
  ]

  ws.addRow(['카테고리별 정산 집계'])
  ws.getRow(1).getCell(1).font = { bold: true, size: 13 }
  ws.getRow(1).height = 28

  ws.addRow(['카테고리', '건수', '구입금액(원)', '배송비(원)', '합계(원)', '비중(%)'])
  ws.getRow(2).eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    cell.alignment = { horizontal: 'center' }
  })

  const catMap: Record<string, { count: number; amount: number; shipping: number }> = {}
  for (const r of rows) {
    if (!catMap[r.category]) catMap[r.category] = { count: 0, amount: 0, shipping: 0 }
    catMap[r.category].count++
    catMap[r.category].amount   += r.amount       || 0
    catMap[r.category].shipping += r.shipping_fee || 0
  }
  const grandTotal = Object.values(catMap).reduce((s, v) => s + v.amount + v.shipping, 0)

  for (const [cat, val] of Object.entries(catMap)) {
    const tot = val.amount + val.shipping
    const row = ws.addRow([
      cat, val.count, val.amount, val.shipping, tot,
      grandTotal > 0 ? Math.round((tot / grandTotal) * 1000) / 10 : 0,
    ])
    ;[3, 4, 5].forEach(col => { row.getCell(col).numFmt = '#,##0' })
    row.getCell(6).numFmt = '0.0'
    row.eachCell(cell => {
      cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
      cell.alignment = { horizontal: 'center' }
    })
  }
}

// ────────────────────────────────────────────────
// 메인 POST 핸들러
// ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { ids, adminName: reqAdmin } = await request.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: rows, error } = await supabase
      .from('requests')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const items = rows || []

    const adminName = reqAdmin || '시설관리팀'
    const today    = new Date()
    const yyMM     = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}`
    const dateStr  = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`

    // 정산기간: 선택 항목의 접수일 범위
    const dates = items.map(r => r.created_at?.slice(0, 10)).filter(Boolean).sort()
    const periodStr = dates.length > 0
      ? dates[0] === dates[dates.length - 1]
        ? dates[0]
        : `${dates[0]} ~ ${dates[dates.length - 1]}`
      : dateStr

    const title = `건축물관리용품 구매 정산 현황 (선택 ${items.length}건) — 동양미래대학교 사무처 시설관리팀`

    const workbook = new ExcelJS.Workbook()

    // 시트1: 상세내역
    buildDetailSheet(workbook, items, title, periodStr, adminName, dateStr)

    // 시트2: 카테고리집계
    buildCategorySheet(workbook, items)

    // 시트3: 월별추이 (선택 항목 기준 — 월별 그룹핑)
    const ws3 = workbook.addWorksheet('월별추이')
    ws3.columns = [
      { key: 'month',  width: 14 },
      { key: 'count',  width: 10 },
      { key: 'amount', width: 18 },
    ]

    ws3.addRow(['선택 항목 월별 집계'])
    ws3.getRow(1).getCell(1).font = { bold: true, size: 13 }
    ws3.getRow(1).height = 28

    ws3.addRow(['월', '건수', '합계금액(원)'])
    ws3.getRow(2).eachCell(cell => {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    // 선택 항목을 접수월(created_at 기준)로 집계
    const monthMap: Record<string, { count: number; amount: number }> = {}
    for (const r of items) {
      const m = r.created_at ? r.created_at.slice(0, 7) : '알수없음'
      if (!monthMap[m]) monthMap[m] = { count: 0, amount: 0 }
      monthMap[m].count++
      monthMap[m].amount += (r.amount || 0) + (r.shipping_fee || 0)
    }

    for (const [m, val] of Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b))) {
      const row = ws3.addRow([m, val.count, val.amount])
      row.getCell(3).numFmt = '#,##0'
      row.eachCell(cell => {
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
        cell.alignment = { horizontal: 'center' }
      })
    }

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
