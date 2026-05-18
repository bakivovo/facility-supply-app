import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getSupabase()
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  const { data: all } = await supabase.from('requests').select('status, amount, shipping_fee, purchase_date')

  const stats = {
    new: 0,
    reviewing: 0,
    purchased: 0,
    settled_purchase: 0,
    settled_shipping: 0,
    settled_total: 0,
  }

  for (const r of all || []) {
    if (r.status === 'new') stats.new++
    else if (r.status === 'reviewing') stats.reviewing++
    else if (r.status === 'purchased') stats.purchased++

    if (r.status === 'settled') {
      const pd = r.purchase_date ? new Date(r.purchase_date) : null
      if (pd && pd >= new Date(firstDay) && pd <= new Date(lastDay)) {
        stats.settled_purchase += r.amount || 0
        stats.settled_shipping += r.shipping_fee || 0
        stats.settled_total += (r.amount || 0) + (r.shipping_fee || 0)
      }
    }
  }

  return NextResponse.json({ data: stats })
}
