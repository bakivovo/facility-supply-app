/**
 * 재고관리 소모내역 현황 엑셀 빌더 (/inventory 재고현황 탭 → 엑셀 다운로드)
 *
 * 시트1 "소모내역": 제목/기준월/요약 3행 + 빈 행 + 헤더(5행) + 데이터
 * 시트2 "재고현황": 물품명/규격/입고량/소모량/현재고 (0 이하 빨강, 1~3 주황 배경)
 */

import ExcelJS from 'exceljs'
import type { ConsumptionRecord, InventoryItem } from '@/types'

const BLUE = 'FF0A67A6'
const thin = { style: 'thin' as const }
const hair = { style: 'hair' as const }

function styleHeader(row: ExcelJS.Row) {
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border    = { top: thin, bottom: thin, left: thin, right: thin }
  })
  row.height = 24
}

export function buildConsumptionStockWorkbook(
  records: ConsumptionRecord[],
  items: InventoryItem[],
  year: number,
  month: number,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  // ── 시트1: 소모내역 ──
  const ws = workbook.addWorksheet('소모내역')
  const COLS = 9
  ws.columns = [
    { width: 12 }, { width: 14 }, { width: 22 }, { width: 16 }, { width: 8 },
    { width: 12 }, { width: 16 }, { width: 20 }, { width: 10 },
  ]

  const confirmedCount = records.filter(r => r.status === 'confirmed').length
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const infoRows: Array<{ text: string; font: Partial<ExcelJS.Font>; height: number }> = [
    { text: '동양미래대학교 사무처 시설관리팀 · 소모내역 현황', font: { bold: true, size: 13 }, height: 28 },
    { text: `기준월: ${year}년 ${month}월 / 다운로드: ${todayStr}`, font: { size: 10, color: { argb: 'FF666666' } }, height: 20 },
    { text: `전체 ${records.length}건 / 확인완료 ${confirmedCount}건 / 대기 ${records.length - confirmedCount}건`, font: { size: 10, bold: true, color: { argb: BLUE } }, height: 20 },
  ]
  infoRows.forEach((info, i) => {
    ws.mergeCells(i + 1, 1, i + 1, COLS)
    const cell = ws.getCell(i + 1, 1)
    cell.value = info.text
    cell.font = info.font
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(i + 1).height = info.height
  })
  ws.getRow(4).height = 8

  const headerRow = ws.getRow(5)
  headerRow.values = ['등록일', '이름', '물품명', '규격', '수량', '사용일', '사용처', '메모', '상태']
  styleHeader(headerRow)

  for (const r of records) {
    const row = ws.addRow([
      r.created_at.slice(0, 10),
      r.input_by,
      r.item_name,
      r.spec || '-',
      r.quantity,
      r.used_date,
      r.used_location || '-',
      r.note || '-',
      r.status === 'confirmed' ? '확인완료' : '대기',
    ])
    row.eachCell(cell => {
      cell.font      = { size: 10 }
      cell.border    = { top: hair, bottom: hair, left: hair, right: hair }
      cell.alignment = { vertical: 'middle' }
    })
  }

  // ── 시트2: 재고현황 ──
  const ss = workbook.addWorksheet('재고현황')
  ss.columns = [{ width: 24 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 10 }]

  const stockHeader = ss.getRow(1)
  stockHeader.values = ['물품명', '규격', '입고량', '소모량', '현재고']
  styleHeader(stockHeader)

  for (const item of items) {
    const row = ss.addRow([item.item_name, item.spec || '-', item.incoming, item.consumed, item.stock])
    const bg = item.stock <= 0 ? 'FFFFC7CE' : item.stock <= 3 ? 'FFFFE0B2' : null
    row.eachCell((cell, col) => {
      cell.font      = { size: 10 }
      cell.border    = { top: hair, bottom: hair, left: hair, right: hair }
      cell.alignment = { vertical: 'middle', horizontal: col >= 3 ? 'right' : 'left' }
      if (bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
  }

  return workbook
}
