import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function extractPath(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0])
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()
  const { ids } = await request.json()

  if (!ids?.length) return NextResponse.json({ error: 'ids 필요' }, { status: 400 })

  // 삭제 대상 레코드의 사진 URL 조회
  const { data: rows, error: fetchErr } = await supabase
    .from('requests')
    .select('id, delivery_photo_urls, receipt_photo_urls')
    .in('id', ids)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const deliveryPaths: string[] = []
  const receiptPaths: string[] = []

  for (const row of rows ?? []) {
    for (const url of row.delivery_photo_urls ?? []) {
      const p = extractPath(url, 'delivery-photos')
      if (p) deliveryPaths.push(p)
    }
    for (const photo of row.receipt_photo_urls ?? []) {
      const url = typeof photo === 'string' ? photo : photo?.url
      if (!url) continue
      const p = extractPath(url, 'receipt-photos')
      if (p) receiptPaths.push(p)
    }
  }

  // Storage에서 파일 삭제
  if (deliveryPaths.length > 0) {
    await supabase.storage.from('delivery-photos').remove(deliveryPaths)
  }
  if (receiptPaths.length > 0) {
    await supabase.storage.from('receipt-photos').remove(receiptPaths)
  }

  // DB에서 사진 URL 필드만 초기화 (다른 데이터 유지)
  const { error: updateErr } = await supabase
    .from('requests')
    .update({ delivery_photo_urls: [], receipt_photo_urls: [] })
    .in('id', ids)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    deleted: deliveryPaths.length + receiptPaths.length,
  })
}
