import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const adminName = searchParams.get('admin') || '시설관리팀'

    if (!month) return NextResponse.json({ error: 'month 파라미터가 필요합니다.' }, { status: 400 })

    const [year, mon] = month.split('-')
    const startDate = `${year}-${mon}-01`
    const endDate = `${year}-${mon}-31`

    const { data: allData } = await supabase
      .from('requests')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at')

    const rows = allData || []

    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(parseInt(year), parseInt(mon) - 1 - i, 1)
      last12Months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    }

    const workbook = new ExcelJS.Workbook()
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`
    const periodStr = `${year}년 ${parseInt(mon)}월 01일 ~ ${year}년 ${parseInt(mon)}월 말일`

    // 시트1: 상세내역
    const ws1 = workbook.addWorksheet('상세내역')
    ws1.columns = [
      { key: 'receipt_number', width: 20 },
      { key: 'created_at', width: 14 },
      { key: 'category', width: 14 },
      { key: 'item_name', width: 20 },
      { key: 'spec', width: 16 },
      { key: 'quantity', width: 8 },
      { key: 'unit', width: 8 },
      { key: 'vendor', width: 14 },
      { key: 'purchase_date', width: 14 },
      { key: 'amount', width: 12 },
      { key: 'memo', width: 20 },
      { key: 'status', width: 10 },
      { key: 'purpose', width: 24 },
    ]

    ws1.mergeCells('A1:M1')
    const t1 = ws1.getCell('A1')
    t1.value = `${year}년 ${parseInt(mon)}월 건축물관리용품 구매 정산 현황 — 동양미래대학교 사무처 시설관리팀`
    t1.font = { bold: true, size: 14 }
    t1.alignment = { horizontal: 'center', vertical: 'middle' }
    ws1.getRow(1).height = 36

    ws1.mergeCells('A2:E2')
    ws1.getCell('A2').value = `정산기간: ${periodStr}`
    ws1.mergeCells('F2:I2')
    ws1.getCell('F2').value = `담당자: ${adminName}`
    ws1.mergeCells('J2:M2')
    ws1.getCell('J2').value = `출력일: ${dateStr}`
    ws1.getRow(2).eachCell(cell => {
      cell.font = { size: 10 }
      cell.alignment = { horizontal: 'left' }
    })
    ws1.getRow(2).height = 18

    const headers = ['접수번호', '접수일', '카테고리', '물품명', '규격', '수량', '단위', '구입처', '구입일', '금액(원)', '메모', '상태', '요청사유']
    ws1.addRow(headers)
    const headerRow = ws1.getRow(3)
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    const statusLabel: Record<string, string> = {
      new: '신규', reviewing: '검토중', purchased: '구입완료', settled: '정산완료', rejected: '반려'
    }

    const dataStartRow = 4
    for (const r of rows) {
      const row = ws1.addRow([
        r.receipt_number || '',
        r.created_at ? r.created_at.slice(0, 10) : '',
        r.category || '',
        r.item_name || '',
        r.spec || '',
        r.quantity || 0,
        r.unit || '개',
        r.vendor || '',
        r.purchase_date || '',
        r.amount || '',
        r.memo || '',
        statusLabel[r.status] || r.status,
        r.purpose || '',
      ])
      row.eachCell(cell => {
        cell.font = { size: 10 }
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
      })
    }

    const sumRow = ws1.addRow(['합계', '', '', '', '', '', '', '', '', { formula: `SUM(J${dataStartRow}:J${dataStartRow + rows.length - 1})` }, '', '', ''])
    sumRow.getCell(1).font = { bold: true }
    sumRow.getCell(10).font = { bold: true }
    sumRow.getCell(10).numFmt = '#,##0'
    sumRow.eachCell(cell => {
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })

    // 시트2: 카테고리집계
    const ws2 = workbook.addWorksheet('카테고리집계')
    ws2.columns = [
      { key: 'category', width: 18 },
      { key: 'count', width: 10 },
      { key: 'amount', width: 14 },
      { key: 'ratio', width: 10 },
    ]

    ws2.addRow(['카테고리별 정산 집계'])
    ws2.getRow(1).getCell(1).font = { bold: true, size: 13 }
    ws2.getRow(1).height = 28

    ws2.addRow(['카테고리', '건수', '금액(원)', '비중(%)'])
    ws2.getRow(2).eachCell(cell => {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    const catMap: Record<string, { count: number; amount: number }> = {}
    for (const r of rows) {
      if (!catMap[r.category]) catMap[r.category] = { count: 0, amount: 0 }
      catMap[r.category].count++
      catMap[r.category].amount += r.amount || 0
    }
    const totalAmt = Object.values(catMap).reduce((s, v) => s + v.amount, 0)

    for (const [cat, val] of Object.entries(catMap)) {
      const row = ws2.addRow([cat, val.count, val.amount, totalAmt > 0 ? Math.round((val.amount / totalAmt) * 1000) / 10 : 0])
      row.getCell(3).numFmt = '#,##0'
      row.getCell(4).numFmt = '0.0'
      row.eachCell(cell => {
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
        cell.alignment = { horizontal: 'center' }
      })
    }

    // 시트3: 월별추이
    const ws3 = workbook.addWorksheet('월별추이')
    ws3.columns = [
      { key: 'month', width: 14 },
      { key: 'count', width: 10 },
      { key: 'amount', width: 14 },
    ]

    ws3.addRow(['최근 12개월 월별 집계'])
    ws3.getRow(1).getCell(1).font = { bold: true, size: 13 }
    ws3.getRow(1).height = 28

    ws3.addRow(['월', '건수', '금액(원)'])
    ws3.getRow(2).eachCell(cell => {
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center' }
    })

    for (const m of last12Months) {
      const [y, mo] = m.split('-')
      const { data: mData } = await supabase
        .from('requests')
        .select('amount')
        .gte('created_at', `${y}-${mo}-01`)
        .lte('created_at', `${y}-${mo}-31`)

      const mRows = mData || []
      const mCount = mRows.length
      const mAmount = mRows.reduce((s: number, r: any) => s + (r.amount || 0), 0)

      const row = ws3.addRow([m, mCount, mAmount])
      row.getCell(3).numFmt = '#,##0'
      row.eachCell(cell => {
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
        cell.alignment = { horizontal: 'center' }
      })
    }

    const buffer = await workbook.xlsx.writeBuffer()
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
