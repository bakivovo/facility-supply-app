import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ matched: false, error: 'GOOGLE_SHEET_WEBHOOK_URL 미설정' }, { status: 200 })
  }

  const body = await request.json()

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    const text = await res.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch { /* 비-JSON 응답 허용 */ }

    // Apps Script 응답에서 매칭 여부 판단
    // { result: 'matched' | 'unmatched' } 또는 { matched: true | false } 지원
    const matched =
      data.result === 'matched' ||
      data.matched === true ||
      (res.ok && data.result === 'success') ||
      (res.ok && !('result' in data) && !('matched' in data))

    return NextResponse.json({ matched })
  } catch (err: any) {
    console.error('[sheet-webhook] 전송 실패:', err?.message)
    return NextResponse.json({ matched: false, error: err?.message }, { status: 200 })
  }
}
