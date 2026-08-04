/**
 * 정산내역 엑셀 공유 빌더
 *
 * 시트 구성:
 *   [1] 정산내역 — 9열 테이블 (접수번호/물품명/구입처/구입일/수량/단가/구입금액/배송비/합계)
 *   [2] 납품사진 — 항목별 구분 헤더 + 납품완료 사진을 세로로 하나씩 순서대로 배치
 *   [3] 영수증   — 항목별 구분 헤더 + "물건 영수증"·"배송료 영수증" 라벨 구분,
 *                  각 라벨 아래 사진을 세로로 하나씩 순서대로 배치 (없는 라벨은 생략)
 *
 * 사용처:
 *   - /api/excel/monthly  (월별 정산 탭 → 엑셀 내보내기)
 *   - /api/excel/bulk     (요청 목록 탭 → 선택 항목 엑셀 다운로드)
 */

import ExcelJS from 'exceljs'
import type { Request } from '@/types'

// ────────────────────────────────────────────────
// 내부 헬퍼
// ────────────────────────────────────────────────
const SUPPORTED_IMG_EXTS = new Set(['jpeg', 'png', 'gif'])

async function fetchImageBuffer(url: string): Promise<{ buffer: any; ext: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    // Content-Type이 image/* 인지 검증 — HTML 에러 페이지 차단
    const ct = res.headers.get('content-type') || ''
    if (!ct.startsWith('image/')) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: any = Buffer.from(new Uint8Array(await res.arrayBuffer()))
    if (buffer.length === 0) return null
    const rawExt = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpeg'
    const ext = rawExt === 'jpg' ? 'jpeg' : SUPPORTED_IMG_EXTS.has(rawExt) ? rawExt : 'jpeg'
    return { buffer, ext }
  } catch {
    return null
  }
}

function applyHeaderStyle(cell: ExcelJS.Cell) {
  cell.font  = { bold: true, size: 10 }
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
  cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

// ── "영수증" 시트 전용: 라벨 + 사진 세로(행 방향) 배치 렌더링 ──
const RECEIPT_IMG_H = 40  // 이미지 1장이 차지하는 행 수 (기존과 동일)
const RECEIPT_ROW_H = 15  // 이미지 영역 각 행의 높이(px)

// 라벨 행 + 사진을 세로로 하나씩 순서대로 배치. urls가 비어있으면 아무것도 그리지 않고 startRow 그대로 반환
async function renderReceiptSection(
  workbook: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  startRow: number,
  label: string,
  urls: string[],
  fetchImage: (url: string) => Promise<{ buffer: any; ext: string } | null>,
): Promise<number> {
  const validUrls = urls.filter(Boolean)
  if (validUrls.length === 0) return startRow

  let row = startRow

  // 라벨 행 (연한 회색 배경) — 섹션당 한 번만 표시, 사진 아래 캡션은 없음
  ws.mergeCells(row, 1, row, 2)
  const labelCell = ws.getCell(row, 1)
  labelCell.value     = label
  labelCell.font      = { bold: true, size: 10, color: { argb: 'FF666666' } }
  labelCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
  labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(row).height = 20
  row++

  for (let i = 0; i < validUrls.length; i++) {
    const imgStart = row
    const imgEnd   = row + RECEIPT_IMG_H - 1

    for (let rr = imgStart; rr <= imgEnd; rr++) ws.getRow(rr).height = RECEIPT_ROW_H

    for (let rr = imgStart; rr <= imgEnd; rr++) {
      const top    = rr === imgStart ? { style: 'thin' as const } : undefined
      const bottom = rr === imgEnd   ? { style: 'thin' as const } : undefined
      ws.getCell(rr, 1).border = { top, bottom, left: { style: 'thin' } }
      ws.getCell(rr, 2).border = { top, bottom, right: { style: 'thin' } }
    }

    try {
      const img = await fetchImage(validUrls[i])
      if (img) {
        const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(ws as any).addImage(imgId, {
          tl: { col: 0, row: imgStart - 1 },
          br: { col: 1, row: imgEnd },
          editAs: 'oneCell',
        })
      }
    } catch {
      // 이미지 삽입 실패 시 해당 칸만 건너뜀
    }

    row = imgEnd + 1
  }

  return row
}

// ────────────────────────────────────────────────
// 메인 엑셀 빌더
// ────────────────────────────────────────────────
export async function buildSettlementWorkbook(
  items: Request[],
  title: string,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  // ── 시트1: 정산내역 ──────────────────────────
  const ws1 = workbook.addWorksheet('정산내역')
  ws1.columns = [
    { key: 'receipt_number', width: 20 },  // A
    { key: 'purchase_date',  width: 12 },  // B
    { key: 'item_name',      width: 24 },  // C
    { key: 'spec',           width: 14 },  // D
    { key: 'quantity',       width: 8  },  // E
    { key: 'unit_price',     width: 12 },  // F
    { key: 'amount',         width: 14 },  // G
    { key: 'shipping_fee',   width: 14 },  // H
    { key: 'total',          width: 14 },  // I
    { key: 'vendor',         width: 14 },  // J
  ]

  // 행1: 제목
  ws1.mergeCells('A1:J1')
  const titleCell = ws1.getCell('A1')
  titleCell.value     = title
  titleCell.font      = { bold: true, size: 13 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws1.getRow(1).height = 32

  // 행2: 열 헤더
  ws1.addRow(['접수번호', '구입일', '물품명', '규격', '수량', '단가(원)', '구입금액(원)', '배송비(원)', '합계(원)', '구입처'])
  ws1.getRow(2).eachCell(applyHeaderStyle)

  // 행3~: 데이터
  const DATA_START = 3
  for (const r of items) {
    const amt = r.amount       || 0
    const fee = r.shipping_fee || 0
    const row = ws1.addRow([
      r.receipt_number || '',
      r.purchase_date  || '',
      r.item_name      || '',
      r.spec           || '',
      r.purchase_quantity ?? r.quantity ?? '',
      r.unit_price     || '',
      amt || '',
      fee || '',
      (amt + fee) || '',
      r.vendor         || '',
    ])
    row.eachCell((cell, col) => {
      cell.font   = { size: 10 }
      cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
      if (col >= 6 && col <= 9) {
        cell.numFmt    = '#,##0'
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        cell.alignment = { vertical: 'middle' }
      }
    })
  }

  // 합계행
  const lastData = DATA_START + items.length - 1
  const sumRow = ws1.addRow([
    '합계', '', '', '', '', '',
    { formula: `SUM(G${DATA_START}:G${lastData})` },
    { formula: `SUM(H${DATA_START}:H${lastData})` },
    { formula: `SUM(I${DATA_START}:I${lastData})` },
    '',
  ])
  sumRow.getCell(1).font = { bold: true }
  ;[7, 8, 9].forEach(col => {
    sumRow.getCell(col).font      = { bold: true }
    sumRow.getCell(col).numFmt    = '#,##0'
    sumRow.getCell(col).alignment = { horizontal: 'right' }
  })
  sumRow.eachCell(cell => {
    cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } }
  })

  // ── 시트2: 납품사진 ──────────────────────────
  const ws2 = workbook.addWorksheet('납품사진')
  ws2.getColumn(1).width = 45
  ws2.getColumn(2).width = 15

  let dRow = 1
  for (const r of items) {
    // 항목 헤더
    ws2.mergeCells(`A${dRow}:B${dRow}`)
    const dHead = ws2.getCell(`A${dRow}`)
    dHead.value     = `${r.receipt_number}  ·  ${r.item_name}`
    dHead.font      = { bold: true, size: 11 }
    dHead.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
    dHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws2.getRow(dRow).height = 22
    dRow++

    const photos: string[] = r.delivery_photo_urls || []

    if (photos.length === 0) {
      ws2.mergeCells(`A${dRow}:B${dRow}`)
      const noCell = ws2.getCell(`A${dRow}`)
      noCell.value     = '사진 없음'
      noCell.font      = { italic: true, size: 10, color: { argb: 'FF999999' } }
      noCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws2.getRow(dRow).height = 30
      dRow++
    } else {
      // 세로 1열: 이미지 20행 + 캡션 2행 = 슬롯 22행씩 순서대로 배치
      const IMG_H = 20
      const CAP_H = 2

      for (let pIdx = 0; pIdx < photos.length; pIdx++) {
        const photoUrl = photos[pIdx]
        const imgStart = dRow
        const imgEnd   = dRow + IMG_H - 1
        const capStart = dRow + IMG_H

        for (let rr = imgStart; rr <= imgEnd; rr++) ws2.getRow(rr).height = 9
        for (let rr = capStart; rr < capStart + CAP_H; rr++) ws2.getRow(rr).height = 14

        // 테두리 (A열 메인 + B열 보조)
        for (let rr = imgStart; rr <= capStart; rr++) {
          const top    = rr === imgStart ? { style: 'thin' as const } : undefined
          const bottom = rr === capStart ? { style: 'thin' as const } : undefined
          ws2.getCell(`A${rr}`).border = { top, bottom, left: { style: 'thin' } }
          ws2.getCell(`B${rr}`).border = { top, bottom, right: { style: 'thin' } }
        }

        // 캡션
        ws2.mergeCells(`A${capStart}:B${capStart}`)
        const capCell      = ws2.getCell(`A${capStart}`)
        capCell.value      = `사진 ${pIdx + 1}`
        capCell.alignment  = { horizontal: 'center', vertical: 'middle' }
        capCell.font       = { size: 9, color: { argb: 'FF444444' } }

        // 이미지 (A열에 정렬, 너비는 기존과 동일)
        if (photoUrl) {
          try {
            const img = await fetchImageBuffer(photoUrl)
            if (img) {
              const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(ws2 as any).addImage(imgId, {
                tl: { col: 0, row: imgStart - 1 },
                br: { col: 1, row: imgEnd },
                editAs: 'oneCell',
              })
            }
          } catch {
            // 이미지 삽입 실패 시 해당 칸만 건너뜀
          }
        }

        dRow = capStart + CAP_H
      }
    }

    // 항목 구분 여백
    ws2.getRow(dRow).height = 8
    dRow++
  }

  // ── 시트3: 영수증 (물건 영수증 + 배송료 영수증, 항목 순서대로) ──
  const ws3 = workbook.addWorksheet('영수증')
  ws3.getColumn(1).width = 90
  ws3.getColumn(2).width = 15

  let rRow = 1
  for (const r of items) {
    const itemReceiptUrls: string[] = ((r.receipt_photo_urls as Array<{ url?: string }>) || [])
      .map(rp => rp.url).filter((u): u is string => !!u)
    const itemDeliveryReceiptUrls: string[] = (r.delivery_receipt_photo_urls || []).filter(Boolean)

    // 항목 헤더
    ws3.mergeCells(rRow, 1, rRow, 2)
    const rHead = ws3.getCell(rRow, 1)
    rHead.value     = `${r.receipt_number}  ·  ${r.item_name}`
    rHead.font      = { bold: true, size: 11 }
    rHead.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }
    rHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws3.getRow(rRow).height = 22
    rRow++

    const rowBefore = rRow
    rRow = await renderReceiptSection(workbook, ws3, rRow, '물건 영수증', itemReceiptUrls, fetchImageBuffer)
    rRow = await renderReceiptSection(workbook, ws3, rRow, '배송료 영수증', itemDeliveryReceiptUrls, fetchImageBuffer)

    if (rRow === rowBefore) {
      // 물건 영수증·배송료 영수증 모두 없음
      ws3.mergeCells(rRow, 1, rRow, 2)
      const noCell = ws3.getCell(rRow, 1)
      noCell.value     = '사진 없음'
      noCell.font      = { italic: true, size: 10, color: { argb: 'FF999999' } }
      noCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws3.getRow(rRow).height = 30
      rRow++
    }

    // 항목 구분 여백
    ws3.getRow(rRow).height = 8
    rRow++
  }

  return workbook
}
