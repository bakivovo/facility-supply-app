import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function fetchImageBuffer(url: string): Promise<{ buffer: any; ext: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer: any = Buffer.from(new Uint8Array(ab))
    const rawExt = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpeg'
    const ext = rawExt === 'jpg' ? 'jpeg' : rawExt
    return { buffer, ext }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: rows, error } = await supabase
      .from('requests')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const items = rows || []

    const workbook = new ExcelJS.Workbook()
    const today = new Date()
    const yyMM = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}`
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`

    // ────────────────────────────────────────────────
    // 시트1: 정산내역
    // ────────────────────────────────────────────────
    const ws1 = workbook.addWorksheet('정산내역')
    ws1.columns = [
      { key: 'receipt_number', width: 20 },
      { key: 'item_name', width: 24 },
      { key: 'vendor', width: 14 },
      { key: 'purchase_date', width: 12 },
      { key: 'amount', width: 14 },
      { key: 'shipping_fee', width: 14 },
      { key: 'total', width: 14 },
    ]

    ws1.mergeCells('A1:G1')
    const t1 = ws1.getCell('A1')
    t1.value = `선택 항목 정산내역 (${items.length}건) — ${dateStr}  /  동양미래대학교 사무처 시설관리팀`
    t1.font = { bold: true, size: 13 }
    t1.alignment = { horizontal: 'center', vertical: 'middle' }
    ws1.getRow(1).height = 34

    ws1.addRow(['접수번호', '물품명', '구입처', '구입일', '구입금액(원)', '배송비(원)', '합계(원)'])
    ws1.getRow(2).eachCell(cell => {
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let totalAmount = 0
    let totalShipping = 0

    for (const r of items) {
      const amt = r.amount || 0
      const fee = r.shipping_fee || 0
      totalAmount += amt
      totalShipping += fee
      const dataRow = ws1.addRow([
        r.receipt_number || '',
        r.item_name || '',
        r.vendor || '',
        r.purchase_date || '',
        amt || '',
        fee || '',
        (amt + fee) || '',
      ])
      dataRow.eachCell((cell, colNumber) => {
        cell.font = { size: 10 }
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } }
        cell.alignment = colNumber >= 5
          ? { horizontal: 'right', vertical: 'middle' }
          : { vertical: 'middle' }
        if (colNumber >= 5) cell.numFmt = '#,##0'
      })
    }

    const sumRow = ws1.addRow(['합계', '', '', '', totalAmount, totalShipping, totalAmount + totalShipping])
    sumRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10 }
      cell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } }
      if (colNumber >= 5) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'right', vertical: 'middle' } }
    })

    // ────────────────────────────────────────────────
    // 시트2: 납품사진
    // ────────────────────────────────────────────────
    const ws2 = workbook.addWorksheet('납품사진')
    ws2.getColumn(1).width = 45
    ws2.getColumn(2).width = 45

    ws2.mergeCells('A1:B1')
    const t2 = ws2.getCell('A1')
    t2.value = `납품완료 사진 — ${dateStr}  /  동양미래대학교 사무처 시설관리팀`
    t2.font = { bold: true, size: 12 }
    t2.alignment = { horizontal: 'center', vertical: 'middle' }
    ws2.getRow(1).height = 32

    let dRow = 2 // 납품사진 현재 행 포인터

    for (const r of items) {
      // 항목 헤더
      ws2.mergeCells(`A${dRow}:B${dRow}`)
      const dHeader = ws2.getCell(`A${dRow}`)
      dHeader.value = `${r.receipt_number}  ·  ${r.item_name}`
      dHeader.font = { bold: true, size: 11 }
      dHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      dHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      ws2.getRow(dRow).height = 22
      dRow++

      const photos: string[] = r.delivery_photo_urls || []

      if (photos.length === 0) {
        ws2.mergeCells(`A${dRow}:B${dRow}`)
        const noCell = ws2.getCell(`A${dRow}`)
        noCell.value = '사진 없음'
        noCell.font = { italic: true, size: 10, color: { argb: 'FF999999' } }
        noCell.alignment = { horizontal: 'center', vertical: 'middle' }
        ws2.getRow(dRow).height = 30
        dRow++
      } else {
        // 2열 그리드, 사진 1슬롯 = 이미지 20행 + 캡션 2행
        const IMG_H = 20
        const CAP_H = 2
        const SLOT = IMG_H + CAP_H

        for (let pIdx = 0; pIdx < photos.length; pIdx += 2) {
          const imgStart = dRow
          const imgEnd = dRow + IMG_H - 1
          const capRow = dRow + IMG_H

          for (let rr = imgStart; rr <= imgEnd; rr++) ws2.getRow(rr).height = 9
          for (let rr = capRow; rr <= capRow + CAP_H - 1; rr++) ws2.getRow(rr).height = 14

          for (let col = 0; col < 2; col++) {
            const photoUrl = photos[pIdx + col]
            const colLetter = col === 0 ? 'A' : 'B'

            // 테두리
            for (let rr = imgStart; rr <= capRow; rr++) {
              ws2.getCell(`${colLetter}${rr}`).border = {
                top: rr === imgStart ? { style: 'thin' } : undefined,
                left: { style: 'thin' },
                right: { style: 'thin' },
                bottom: rr === capRow ? { style: 'thin' } : undefined,
              }
            }

            // 캡션
            const capCell = ws2.getCell(`${colLetter}${capRow}`)
            capCell.value = photoUrl ? `사진 ${pIdx + col + 1}` : ''
            capCell.alignment = { horizontal: 'center', vertical: 'middle' }
            capCell.font = { size: 9, color: { argb: 'FF444444' } }

            // 이미지
            if (photoUrl) {
              const img = await fetchImageBuffer(photoUrl)
              if (img) {
                const imageId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(ws2 as any).addImage(imageId, {
                  tl: { col, row: imgStart - 1 },
                  br: { col: col + 1, row: imgEnd },
                  editAs: 'oneCell',
                })
              }
            }
          }

          dRow += SLOT
        }
      }

      // 항목 구분 빈 행
      ws2.getRow(dRow).height = 8
      dRow++
    }

    // ────────────────────────────────────────────────
    // 시트3: 영수증
    // ────────────────────────────────────────────────
    const ws3 = workbook.addWorksheet('영수증')
    ws3.getColumn(1).width = 90
    ws3.getColumn(2).width = 15

    ws3.mergeCells('A1:B1')
    const t3 = ws3.getCell('A1')
    t3.value = `영수증 사진 — ${dateStr}  /  동양미래대학교 사무처 시설관리팀`
    t3.font = { bold: true, size: 12 }
    t3.alignment = { horizontal: 'center', vertical: 'middle' }
    ws3.getRow(1).height = 32

    let rRow = 2 // 영수증 현재 행 포인터

    for (const r of items) {
      // 항목 헤더
      ws3.mergeCells(`A${rRow}:B${rRow}`)
      const rHeader = ws3.getCell(`A${rRow}`)
      rHeader.value = `${r.receipt_number}  ·  ${r.item_name}`
      rHeader.font = { bold: true, size: 11 }
      rHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }
      rHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
      ws3.getRow(rRow).height = 22
      rRow++

      const receipts: Array<{ label: string; url?: string }> = r.receipt_photo_urls || []

      if (receipts.length === 0) {
        ws3.mergeCells(`A${rRow}:B${rRow}`)
        const noCell = ws3.getCell(`A${rRow}`)
        noCell.value = '사진 없음'
        noCell.font = { italic: true, size: 10, color: { argb: 'FF999999' } }
        noCell.alignment = { horizontal: 'center', vertical: 'middle' }
        ws3.getRow(rRow).height = 30
        rRow++
      } else {
        const IMG_H = 40 // 영수증 이미지 높이(행 수)

        for (const rp of receipts) {
          const imgStart = rRow
          const imgEnd = rRow + IMG_H - 1
          const capRow = rRow + IMG_H

          for (let rr = imgStart; rr <= imgEnd; rr++) {
            ws3.getRow(rr).height = 15
            const cell = ws3.getCell(`A${rr}`)
            cell.border = {
              top: rr === imgStart ? { style: 'thin' } : undefined,
              left: { style: 'thin' },
              right: { style: 'thin' },
              bottom: rr === imgEnd ? { style: 'thin' } : undefined,
            }
          }

          if (rp.url) {
            const img = await fetchImageBuffer(rp.url)
            if (img) {
              const imageId = workbook.addImage({ buffer: img.buffer, extension: img.ext as any })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ;(ws3 as any).addImage(imageId, {
                tl: { col: 0, row: imgStart - 1 },
                br: { col: 1, row: imgEnd },
                editAs: 'oneCell',
              })
            }
          }

          // 캡션
          ws3.mergeCells(`A${capRow}:B${capRow}`)
          const capCell = ws3.getCell(`A${capRow}`)
          capCell.value = `${r.item_name}  ·  ${r.receipt_number}  ·  ${rp.label}`
          capCell.font = { size: 10, bold: true }
          capCell.alignment = { horizontal: 'center', vertical: 'middle' }
          ws3.getRow(capRow).height = 22

          rRow += IMG_H + 1
        }
      }

      // 항목 구분 빈 행
      ws3.getRow(rRow).height = 8
      rRow++
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = encodeURIComponent(`${yyMM}_${items.length}건_정산내역.xlsx`)

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
