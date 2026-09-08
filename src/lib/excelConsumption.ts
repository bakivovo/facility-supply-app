/**
 * 소모내역 정산 엑셀 빌더
 *
 * 시트 구성:
 *   행1: 제목 ("동양미래대학교 사무처 시설관리팀 · 소모내역 정산")
 *   행2: 기준월 / 다운로드일
 *   행3: 요약 (전체 / 확인완료 / 대기 건수)
 *   행4: 빈 행
 *   행5: 헤더 (확인일시/등록일/이름/물품명/규격/수량/사용일/사용처/메모/상태)
 *   행6~: 데이터 (확인완료 행은 연한 노란 배경, 대기 행은 흰 배경)
 *
 * 사용처:
 *   - /api/excel/consumption (관리자 소모내역 탭, 재고관리 소모내역 열람 탭 → 엑셀 다운로드)
 */

import ExcelJS from 'exceljs'
import type { ConsumptionRecord } from '@/types'

const COLS = 10

export function buildConsumptionWorkbook(
  records: ConsumptionRecord[],
  year: number,
  month: number,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('소모내역')

  ws.columns = [
    { key: 'confirmed_at',  width: 18 },
    { key: 'created_at',    width: 12 },
    { key: 'input_by',      width: 14 },
    { key: 'item_name',     width: 22 },
    { key: 'spec',          width: 16 },
    { key: 'quantity',      width: 8  },
    { key: 'used_date',     width: 12 },
    { key: 'used_location', width: 16 },
    { key: 'note',          width: 20 },
    { key: 'status',        width: 10 },
  ]

  const confirmedCount = records.filter(r => r.status === 'confirmed').length
  const pendingCount   = records.length - confirmedCount
  const today          = new Date()
  const downloadDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // 행1: 제목
  ws.mergeCells(1, 1, 1, COLS)
  const titleCell = ws.getCell(1, 1)
  titleCell.value     = '동양미래대학교 사무처 시설관리팀 · 소모내역 정산'
  titleCell.font      = { bold: true, size: 13 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  // 행2: 기준월 / 다운로드일
  ws.mergeCells(2, 1, 2, COLS)
  const infoCell = ws.getCell(2, 1)
  infoCell.value     = `기준월: ${year}년 ${month}월 / 다운로드일: ${downloadDateStr}`
  infoCell.font      = { size: 10, color: { argb: 'FF666666' } }
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 20

  // 행3: 요약
  ws.mergeCells(3, 1, 3, COLS)
  const summaryCell = ws.getCell(3, 1)
  summaryCell.value     = `전체 ${records.length}건 / 확인완료 ${confirmedCount}건 / 대기 ${pendingCount}건`
  summaryCell.font      = { size: 10, bold: true, color: { argb: 'FF0A67A6' } }
  summaryCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(3).height = 20

  // 행4: 빈 행
  ws.getRow(4).height = 8

  // 행5: 헤더
  const headerRow = ws.getRow(5)
  headerRow.values = ['확인일시', '등록일', '이름', '물품명', '규격', '수량', '사용일', '사용처', '메모', '상태']
  headerRow.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A67A6' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border    = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })
  headerRow.height = 24

  // 행6~: 데이터
  for (const r of records) {
    const confirmedAtStr = r.confirmed_at ? r.confirmed_at.replace('T', ' ').slice(0, 16) : '-'
    const row = ws.addRow([
      confirmedAtStr,
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

    const bgColor = r.status === 'confirmed' ? 'FFFFFBE0' : 'FFFFFFFF'
    row.eachCell(cell => {
      cell.font      = { size: 10 }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
      cell.border    = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
      cell.alignment = { vertical: 'middle' }
    })
  }

  return workbook
}
