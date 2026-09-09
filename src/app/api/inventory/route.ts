import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { NextResponse } from 'next/server'

// 재고 현황 집계
// 입고량 = requests에서 status='settled' AND is_inventory_item=true 인 건의
//          purchase_quantity 합계 (물품명+규격 기준 그룹)
// 소모량 = consumption_records에서 status='confirmed' 인 건의 quantity 합계
//          (물품명 기준 그룹 — 규격 무관)
// 현재고 = 입고량 - 소모량
// 목록에는 is_inventory_item=true 로 입고된 품목만 표시된다.
export async function GET() {
  const supabase = getSupabaseAdmin()

  const [reqRes, consRes] = await Promise.all([
    supabase
      .from('requests')
      .select('item_name, spec, purchase_quantity')
      .eq('status', 'settled')
      .eq('is_inventory_item', true),
    supabase.from('consumption_records').select('item_name, quantity').eq('status', 'confirmed'),
  ])

  if (reqRes.error) return NextResponse.json({ error: reqRes.error.message }, { status: 500 })
  if (consRes.error) return NextResponse.json({ error: consRes.error.message }, { status: 500 })

  // 소모량: 물품명 기준 합계
  const consumedByName = new Map<string, number>()
  for (const c of consRes.data || []) {
    consumedByName.set(c.item_name, (consumedByName.get(c.item_name) || 0) + (c.quantity || 0))
  }

  // 입고량: 물품명+규격 기준 합계
  const keyOf = (itemName: string, spec: string | null) => `${itemName}|||${spec || ''}`
  const map = new Map<string, { item_name: string; spec: string | null; incoming: number }>()
  for (const r of reqRes.data || []) {
    if (r.purchase_quantity == null) continue
    const key = keyOf(r.item_name, r.spec)
    if (!map.has(key)) map.set(key, { item_name: r.item_name, spec: r.spec, incoming: 0 })
    map.get(key)!.incoming += r.purchase_quantity
  }

  const items = Array.from(map.values())
    .map(v => {
      const consumed = consumedByName.get(v.item_name) || 0
      return { ...v, consumed, stock: v.incoming - consumed }
    })
    .sort((a, b) => a.stock - b.stock || a.item_name.localeCompare(b.item_name, 'ko'))

  return NextResponse.json({ data: items })
}
