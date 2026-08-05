/**
 * 구글시트(Apps Script) 관리대장 웹훅 공용 호출기.
 * /api/admin/sheet-webhook (클라이언트 프록시)과
 * /api/consumption PATCH (서버 직접 호출) 양쪽에서 공유한다.
 */
export async function sendSheetWebhook(payload: Record<string, any>): Promise<{ matched: boolean; error?: string }> {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL
  if (!webhookUrl) {
    return { matched: false, error: 'GOOGLE_SHEET_WEBHOOK_URL 미설정' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

    return { matched }
  } catch (err: any) {
    console.error('[sheetWebhook] 전송 실패:', err?.message)
    return { matched: false, error: err?.message }
  }
}
