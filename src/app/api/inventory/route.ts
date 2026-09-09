import { getInventoryItems } from '@/lib/inventory'
import { NextResponse } from 'next/server'

// 재고 현황 집계 — 상세 로직은 @/lib/inventory 참고
export async function GET() {
  try {
    const items = await getInventoryItems()
    return NextResponse.json({ data: items })
  } catch (err) {
    const message = err instanceof Error ? err.message : '재고 집계 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
