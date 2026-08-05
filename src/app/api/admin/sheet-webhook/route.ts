import { NextRequest, NextResponse } from 'next/server'
import { sendSheetWebhook } from '@/lib/sheetWebhook'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await sendSheetWebhook(body)
  return NextResponse.json(result)
}
