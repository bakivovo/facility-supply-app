import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { receipt_number, item_name, delivery_photo_urls } = body

    const workbook = new ExcelJS.Workbook()
    const today = new Date()
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`

    const photos: string[] = delivery_photo_urls || []
    const photosPerPage = 6 // 3행 × 2열
    const totalPages = Math.max(1, Math.ceil(photos.length / photosPerPage))

    for (let page = 0; page < totalPages; page++) {
      const ws = workbook.addWorksheet(`납품사진_${page + 1}`)

      // 열 너비 설정 (2열)
      ws.getColumn(1).width = 45
      ws.getColumn(2).width = 45
      ws.getColumn(3).width = 20

      // 제목행
      ws.mergeCells('A1:C1')
      const titleCell = ws.getCell('A1')
      titleCell.value = '납품 완료 사진(카드)'
      titleCell.font = { bold: true, size: 16 }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 40

      // 날짜/팀명 우측 정렬
      ws.mergeCells('A2:C2')
      const infoCell = ws.getCell('A2')
      infoCell.value = `${dateStr}  /  동양미래대학교 사무처 시설관리팀`
      infoCell.font = { size: 10, color: { argb: 'FF666666' } }
      infoCell.alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getRow(2).height = 20

      // 빈 구분행
      ws.getRow(3).height = 8

      const pagePhotos = photos.slice(page * photosPerPage, (page + 1) * photosPerPage)
      // 빈 슬롯 채우기 (최대 6개)
      while (pagePhotos.length < photosPerPage) pagePhotos.push('')

      // 3행 × 2열 그리드
      let startRow = 4
      for (let row = 0; row < 3; row++) {
        const imgRow = startRow + row * 20
        const captionRow = imgRow + 18
        ws.getRow(imgRow).height = 120
        ws.getRow(captionRow).height = 20

        for (let col = 0; col < 2; col++) {
          const idx = row * 2 + col
          const colLetter = col === 0 ? 'A' : 'B'
          const photo = pagePhotos[idx]

          // 테두리 적용
          for (let r = imgRow; r <= captionRow; r++) {
            const cell = ws.getCell(`${colLetter}${r}`)
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            }
          }

          // 캡션 행
          const captionCell = ws.getCell(`${colLetter}${captionRow}`)
          if (photo) {
            const fileName = photo.split('/').pop() || `사진_${idx + 1}`
            captionCell.value = fileName
          } else {
            captionCell.value = ''
          }
          captionCell.alignment = { horizontal: 'center', vertical: 'middle' }
          captionCell.font = { size: 9, color: { argb: 'FF444444' } }

          // 이미지 추가 (URL에서 fetch)
          if (photo) {
            try {
              const res = await fetch(photo)
              if (res.ok) {
                const ab = await res.arrayBuffer()
                const uint8 = new Uint8Array(ab)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgBuffer: any = Buffer.from(uint8)
                const ext = photo.split('.').pop()?.toLowerCase() || 'jpeg'
                const imageExt = ext === 'jpg' ? 'jpeg' : ext as 'jpeg' | 'png' | 'gif'

                const imageId = workbook.addImage({
                  buffer: imgBuffer,
                  extension: imageExt,
                })

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(ws as any).addImage(imageId, {
                  tl: { col: col, row: imgRow - 1 },
                  br: { col: col + 1, row: captionRow - 1 },
                  editAs: 'oneCell',
                })
              }
            } catch {
              // 이미지 로드 실패 시 빈 셀 유지
            }
          }
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const filename = encodeURIComponent(`${receipt_number}_납품완료사진.xlsx`)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      },
    })
  } catch (err: any) {
    console.error('납품사진 엑셀 생성 오류:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
