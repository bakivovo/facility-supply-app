import { createClient } from '@/lib/supabase/client'
import type { ConsumptionRecord } from '@/types'

// 소모내역 확인 처리: status=confirmed 로 변경 후 구글시트 웹훅을 호출한다.
// 웹훅 결과는 기다리지 않고 Promise 로 돌려준다.
export async function confirmConsumptionRecord(
  id: string,
): Promise<{ record: ConsumptionRecord; sheetResult: Promise<'matched' | 'unmatched'> }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const confirmedBy = user?.email || '관리자'
  const confirmedAt = new Date().toISOString()

  const res = await fetch('/api/consumption', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id], status: 'confirmed', confirmed_by: confirmedBy, confirmed_at: confirmedAt }),
  })
  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    const snippet = text.slice(0, 120).replace(/<[^>]+>/g, '').trim()
    throw new Error(`서버 오류 (${res.status})${snippet ? ': ' + snippet : ''}`)
  }
  if (!res.ok) throw new Error(body.error || '확인 처리 실패')

  const record: ConsumptionRecord = body.data[0]
  const sheetResult = fetch('/api/admin/sheet-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'consumption',
      item_name: record.item_name,
      spec: record.spec || '',
      quantity: record.quantity,
      used_date: record.used_date,
      used_location: record.used_location || '',
      input_by: record.input_by || '',
      confirmed_at: record.confirmed_at || confirmedAt,
      note: record.note || '',
    }),
  })
    .then(r => r.json())
    .then((d): 'matched' | 'unmatched' => (d.matched ? 'matched' : 'unmatched'))
    .catch((): 'unmatched' => 'unmatched')

  return { record, sheetResult }
}
