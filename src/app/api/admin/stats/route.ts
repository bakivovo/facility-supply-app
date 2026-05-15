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

  const { data: all } = await supabase.from('requests').select('status, amount, purchase_date')

  const stats = {
    new: 0,
    reviewing: 0,
    purchased: 0,
    settled_amount: 0,
  }

  for (const r of all || []) {
    if (r.status === 'new') stats.new++
    else if (r.status === 'reviewing') stats.reviewing++
    else if (r.status === 'purchased') stats.purchased++

    if (r.status === 'settled' && r.amount) {
      const pd = r.purchase_date ? new Date(r.purchase_date) : null
      if (pd && pd >= new Date(firstDay) && pd <= new Date(lastDay)) {
        stats.settled_amount += r.amount
      }
    }
  }

  return NextResponse.json({ data: stats })
}
