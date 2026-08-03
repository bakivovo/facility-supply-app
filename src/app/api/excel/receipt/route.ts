import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { receipt_number, item_name, receipt_photo_urls, delivery_receipt_photo_urls } = body

    const workbook = new ExcelJS.Workbook()
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`

    const receipts: Array<{ label: string; url: string }> = receipt_photo_urls || []
    const deliveryReceipts: string[] = delivery_receipt_photo_urls || []

    // 물건 영수증 + 배송료 영수증을 하나의 시트 목록으로 합침 (시트명 중복 방지를 위해 번호 부여)
    const combined: Array<{ label: string; url: string }> = [
      ...receipts,
      ...deliveryReceipts.map((url, i) => ({
        label: deliveryReceipts.length > 1 ? `배송료영수증_${i + 1}` : '배송료영수증',
        url,
      })),
    ]

    for (let i = 0; i < Math.max(combined.length, 1); i++) {
      const receipt = combined[i]
      const ws = workbook.addWorksheet(receipt ? receipt.label : `영수증_${i + 1}`)

      // 열 너비
      ws.getColumn(1).width = 90
      ws.getColumn(2).width = 15

      // 제목행
      ws.mergeCells('A1:B1')
      const titleCell = ws.getCell('A1')
      titleCell.value = '영수증 사진'
      titleCell.font = { bold: true, size: 16 }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 40

      // 날짜/팀명 우측 정렬
      ws.mergeCells('A2:B2')
      const infoCell = ws.getCell('A2')
      infoCell.value = `${dateStr}  /  동양미래대학교 사무처 시설관리팀`
      infoCell.font = { size: 10, color: { argb: 'FF666666' } }
      infoCell.alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getRow(2).height = 20

      // 사진 영역 (A3:B42 → 약 A4용지 세로)
      ws.mergeCells('A3:B42')
      for (let r = 3; r <= 42; r++) {
        ws.getRow(r).height = 15
        const cell = ws.getCell(`A${r}`)
        cell.border = {
          top: r === 3 ? { style: 'thin' } : undefined,
          left: { style: 'thin' },
          right: { style: 'thin' },
          bottom: r === 42 ? { style: 'thin' } : undefined,
        }
      }

      if (receipt?.url) {
        try {
          const res = await fetch(receipt.url)
          if (res.ok) {
            const ab = await res.arrayBuffer()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const buffer: any = Buffer.from(new Uint8Array(ab))
            const ext = receipt.url.split('.').pop()?.toLowerCase() || 'jpeg'
            const imageExt = ext === 'jpg' ? 'jpeg' : ext as 'jpeg' | 'png'

            const imageId = workbook.addImage({ buffer, extension: imageExt })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(ws as any).addImage(imageId, {
              tl: { col: 0, row: 2 },
              br: { col: 1, row: 42 },
              editAs: 'oneCell',
            })
          }
        } catch { /* 이미지 로드 실패 무시 */ }
      }

      // 하단 캡션
      ws.mergeCells('A43:B43')
      const captionCell = ws.getCell('A43')
      captionCell.value = `${item_name}  ·  ${receipt_number}${receipt ? `  ·  ${receipt.label}` : ''}`
      captionCell.font = { size: 10, bold: true }
      captionCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(43).height = 22
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = encodeURIComponent(`${receipt_number}_영수증사진.xlsx`)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err: any) {
    console.error('영수증 엑셀 생성 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
