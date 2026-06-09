/**
 * 정산내역 엑셀 공유 빌더
 *
 * 시트 구성:
 *   [1] 정산내역  — 9열 테이블 (접수번호/물품명/구입처/구입일/수량/단가/구입금액/배송비/합계)
 *   [2] 납품사진  — 항목별 구분 헤더 + 납품완료 사진 2열 그리드
 *   [3] 영수증    — 항목별 구분 헤더 + 영수증 사진 세로 전체
 *
 * 사용처:
 *   - /api/excel/monthly  (월별 정산 탭 → 엑셀 내보내기)
 *   - /api/excel/bulk     (요청 목록 탭 → 선택 항목 엑셀 다운로드)
 */

import ExcelJS from 'exceljs'

// ────────────────────────────────────────────────
// 내부 헬퍼
// ────────────────────────────────────────────────
async function fetchImageBuffer(url: string): Promise<{ buffer: any; ext: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: any = Buffer.from(new Uint8Array(await res.arrayBuffer()))
    const rawExt = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpeg'
    return { buffer, ext: rawExt === 'jpg' ? 'jpeg' : rawExt }
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

// ────────────────────────────────────────────────
// 메인 엑셀 빌더
// ────────────────────────────────────────────────
export async function buildSettlementWorkbook(
  items: any[],
  title: string,          // 1행에 표시될 제목 전체 문자열
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
  ws2.getColumn(2).width = 45

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
      // 2열 그리드: 이미지 20행 + 캡션 2행 = 슬롯 22행
      const IMG_H = 20
      const CAP_H = 2

      for (let pIdx = 0; pIdx < photos.length; pIdx += 2) {
        const imgStart = dRow
        const imgEnd   = dRow + IMG_H - 1
        const capStart = dRow + IMG_H

        for (let rr = imgStart; rr <= imgEnd; rr++) ws2.getRow(rr).height = 9
        for (let rr = capStart; rr < capStart + CAP_H; rr++) ws2.getRow(rr).height = 14

        for (let col = 0; col < 2; col++) {
          const photoUrl  = photos[pIdx + col]
          const colLetter = col === 0 ? 'A' : 'B'

          // 테두리
          for (let rr = imgStart; rr <= capStart; rr++) {
            ws2.getCell(`${colLetter}${rr}`).border = {
              top:    rr === imgStart ? { style: 'thin' } : undefined,
              left:   { style: 'thin' },
              right:  { style: 'thin' },
              bottom: rr === capStart ? { style: 'thin' } : undefined,
            }
          }

          // 캡션
          const capCell      = ws2.getCell(`${colLetter}${capStart}`)
          capCell.value      = photoUrl ? `사진 ${pIdx + col + 1}` : ''
          capCell.alignment  = { horizontal: 'center', vertical: 'middle' }
          capCell.font       = { size: 9, color: { argb: 'FF444444' } }

          // 이미지
          if (photoUrl) {
            const img = await fetchImageBuffer(photoUrl)
            if (img) {
              const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(ws2 as any).addImage(imgId, {
                tl: { col, row: imgStart - 1 },
                br: { col: col + 1, row: imgEnd },
                editAs: 'oneCell',
              })
            }
          }
        }

        dRow += IMG_H + CAP_H
      }
    }

    // 항목 구분 여백
    ws2.getRow(dRow).height = 8
    dRow++
  }

  // ── 시트3: 영수증 ────────────────────────────
  const ws3 = workbook.addWorksheet('영수증')
  ws3.getColumn(1).width = 90
  ws3.getColumn(2).width = 15

  let rRow = 1
  for (const r of items) {
    // 항목 헤더
    ws3.mergeCells(`A${rRow}:B${rRow}`)
    const rHead = ws3.getCell(`A${rRow}`)
    rHead.value     = `${r.receipt_number}  ·  ${r.item_name}`
    rHead.font      = { bold: true, size: 11 }
    rHead.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }
    rHead.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws3.getRow(rRow).height = 22
    rRow++

    const receipts: Array<{ label: string; url?: string }> = r.receipt_photo_urls || []

    if (receipts.length === 0) {
      ws3.mergeCells(`A${rRow}:B${rRow}`)
      const noCell = ws3.getCell(`A${rRow}`)
      noCell.value     = '사진 없음'
      noCell.font      = { italic: true, size: 10, color: { argb: 'FF999999' } }
      noCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws3.getRow(rRow).height = 30
      rRow++
    } else {
      const IMG_H = 40  // 영수증 사진 높이 (행 수)

      for (const rp of receipts) {
        const imgStart = rRow
        const imgEnd   = rRow + IMG_H - 1
        const capRow   = rRow + IMG_H

        for (let rr = imgStart; rr <= imgEnd; rr++) {
          ws3.getRow(rr).height = 15
          ws3.getCell(`A${rr}`).border = {
            top:    rr === imgStart ? { style: 'thin' } : undefined,
            left:   { style: 'thin' },
            right:  { style: 'thin' },
            bottom: rr === imgEnd   ? { style: 'thin' } : undefined,
          }
        }

        if (rp.url) {
          const img = await fetchImageBuffer(rp.url)
          if (img) {
            const imgId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(ws3 as any).addImage(imgId, {
              tl: { col: 0, row: imgStart - 1 },
              br: { col: 1, row: imgEnd },
              editAs: 'oneCell',
            })
          }
        }

        // 캡션
        ws3.mergeCells(`A${capRow}:B${capRow}`)
        const capCell      = ws3.getCell(`A${capRow}`)
        capCell.value      = `${r.item_name}  ·  ${r.receipt_number}  ·  ${rp.label}`
        capCell.font       = { bold: true, size: 10 }
        capCell.alignment  = { horizontal: 'center', vertical: 'middle' }
        ws3.getRow(capRow).height = 22

        rRow += IMG_H + 1
      }
    }

    // 항목 구분 여백
    ws3.getRow(rRow).height = 8
    rRow++
  }

  return workbook
}
