/**
 * 재고관리 · 소모내역 현황 엑셀 빌더
 *
 * 시트1 "소모내역": 선택 연월 기준 consumption_records
 *   행1 제목 / 행2 기준월·다운로드일 / 행3 요약 / 행4 빈 행 / 행5 헤더 / 행6~ 데이터
 * 시트2 "재고현황": 전체 재고관리 품목 (현재고 0이하 빨강, 1~3 주황 배경)
 *
 * 사용처: /api/excel/inventory-consumption (/inventory 재고현황 탭 섹션 B)
 */

import ExcelJS from 'exceljs'
import type { ConsumptionRecord, InventoryItem } from '@/types'

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A67A6' } } as const
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } } as const
const THIN = { style: 'thin' } as const
const HAIR = { style: 'hair' } as const

export function buildInventoryConsumptionWorkbook(
  records: ConsumptionRecord[],
  inventory: InventoryItem[],
  year: number,
  month: number,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()

  // ─────────── 시트 1: 소모내역 ───────────
  const ws1 = workbook.addWorksheet('소모내역')
  const COLS1 = 9
  ws1.columns = [
    { key: 'created_at', width: 12 },
    { key: 'input_by', width: 14 },
    { key: 'item_name', width: 22 },
    { key: 'spec', width: 16 },
    { key: 'quantity', width: 8 },
    { key: 'used_date', width: 12 },
    { key: 'used_location', width: 16 },
    { key: 'note', width: 22 },
    { key: 'status', width: 10 },
  ]

  const confirmedCount = records.filter(r => r.status === 'confirmed').length
  const pendingCount = records.length - confirmedCount
  const today = new Date()
  const downloadStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  ws1.mergeCells(1, 1, 1, COLS1)
  const title = ws1.getCell(1, 1)
  title.value = '동양미래대학교 사무처 시설관리팀 · 소모내역 현황'
  title.font = { bold: true, size: 13 }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(1).height = 28

  ws1.mergeCells(2, 1, 2, COLS1)
  const info = ws1.getCell(2, 1)
  info.value = `기준월: ${year}년 ${month}월 / 다운로드: ${downloadStr}`
  info.font = { size: 10, color: { argb: 'FF666666' } }
  info.alignment = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(2).height = 20

  ws1.mergeCells(3, 1, 3, COLS1)
  const summary = ws1.getCell(3, 1)
  summary.value = `전체 ${records.length}건 / 확인완료 ${confirmedCount}건 / 대기 ${pendingCount}건`
  summary.font = { size: 10, bold: true, color: { argb: 'FF0A67A6' } }
  summary.alignment = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(3).height = 20

  ws1.getRow(4).height = 8

  const header1 = ws1.getRow(5)
  header1.values = ['등록일', '이름', '물품명', '규격', '수량', '사용일', '사용처', '메모', '상태']
  header1.eachCell(cell => {
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN }
  })
  header1.height = 24

  for (const r of records) {
    const row = ws1.addRow([
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
    const bg = r.status === 'confirmed' ? 'FFFFFBE0' : 'FFFFFFFF'
    row.eachCell(cell => {
      cell.font = { size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.border = { top: HAIR, bottom: HAIR, left: HAIR, right: HAIR }
      cell.alignment = { vertical: 'middle' }
    })
  }

  // ─────────── 시트 2: 재고현황 ───────────
  const ws2 = workbook.addWorksheet('재고현황')
  ws2.columns = [
    { key: 'item_name', width: 24 },
    { key: 'spec', width: 18 },
    { key: 'incoming', width: 10 },
    { key: 'consumed', width: 10 },
    { key: 'stock', width: 10 },
  ]

  const header2 = ws2.getRow(1)
  header2.values = ['물품명', '규격', '입고량', '소모량', '현재고']
  header2.eachCell(cell => {
    cell.font = HEADER_FONT
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { top: THIN, bottom: THIN, left: THIN, right: THIN }
  })
  header2.height = 24

  for (const it of inventory) {
    const row = ws2.addRow([it.item_name, it.spec || '-', it.incoming, it.consumed, it.stock])
    let bg = 'FFFFFFFF'
    if (it.stock <= 0) bg = 'FFFAD4D2'
    else if (it.stock <= 3) bg = 'FFFBE2CC'
    row.eachCell(cell => {
      cell.font = { size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
      cell.border = { top: HAIR, bottom: HAIR, left: HAIR, right: HAIR }
      cell.alignment = { vertical: 'middle' }
    })
  }

  return workbook
}
