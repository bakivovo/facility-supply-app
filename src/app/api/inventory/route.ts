import { getSupabaseAdmin } from '@/lib/supabase/apiClient'
import { fetchInventoryItems } from '@/lib/inventory'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const items = await fetchInventoryItems(getSupabaseAdmin())
    return NextResponse.json({ data: items })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
