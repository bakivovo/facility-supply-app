'use client'

import { useState } from 'react'
import type { ConsumptionRecord } from '@/types'
import { CONSUMPTION_STATUS_LABEL } from '@/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  record: ConsumptionRecord
  onUpdate: (updated: ConsumptionRecord) => void
  onClose: () => void
}

async function safeJson(res: Response): Promise<{ ok: boolean; data: any }> {
  const text = await res.text()
  try {
    return { ok: res.ok, data: JSON.parse(text) }
  } catch {
    const snippet = text.slice(0, 120).replace(/<[^>]+>/g, '').trim()
    return { ok: false, data: { error: `서버 오류 (${res.status})${snippet ? ': ' + snippet : ''}` } }
  }
}

export default function ConsumptionDetailPanel({ record, onUpdate, onClose }: Props) {
  const [itemName, setItemName]   = useState(record.item_name)
  const [spec, setSpec]           = useState(record.spec || '')
  const [quantity, setQuantity]   = useState(record.quantity.toString())
  const [usedDate, setUsedDate]   = useState(record.used_date)
  const [usedLocation, setUsedLocation] = useState(record.used_location || '')
  const [note, setNote]           = useState(record.note || '')

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError]   = useState('')
  const [confirming, setConfirming] = useState(false)
  const [sheetResult, setSheetResult] = useState<'matched' | 'unmatched' | null>(null)

  const isConfirmed = record.status === 'confirmed'
  const inputCls = isConfirmed
    ? 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed'
    : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const handleSave = async () => {
    setSaveStatus('saving'); setSaveError('')
    try {
      const res = await fetch('/api/consumption', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [record.id],
          item_name: itemName,
          spec: spec || null,
          quantity: parseInt(quantity) || 1,
          used_date: usedDate,
          used_location: usedLocation || null,
          note: note || null,
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '저장 실패')
      onUpdate(data.data[0])
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (err: any) {
      setSaveError(err.message); setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const confirmedBy = user?.email || '관리자'
      const confirmedAt = new Date().toISOString()

      const res = await fetch('/api/consumption', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [record.id],
          item_name: itemName,
          spec: spec || null,
          quantity: parseInt(quantity) || 1,
          used_date: usedDate,
          used_location: usedLocation || null,
          note: note || null,
          status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: confirmedAt,
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '확인 처리 실패')
      const updated = data.data[0]
      onUpdate(updated)

      // 시트 반영 웹훅 — 정산완료(RequestDetailPanel)와 동일하게
      // 클라이언트에서 /api/admin/sheet-webhook 프록시를 직접 호출
      setSheetResult(null)
      fetch('/api/admin/sheet-webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'consumption',
          item_name: updated.item_name,
          spec: updated.spec || '',
          quantity: updated.quantity,
          used_date: updated.used_date,
          used_location: updated.used_location || '',
          input_by: updated.input_by || '',
          confirmed_at: updated.confirmed_at || confirmedAt,
          note: updated.note || '',
        }),
      }).then(r => r.json()).then(d => setSheetResult(d.matched ? 'matched' : 'unmatched')).catch(() => setSheetResult('unmatched'))
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mx-2 mb-2">

      {isConfirmed && (
        <div className="flex items-center gap-2 bg-[#EDE900] text-[#3a3800] rounded-lg px-3 py-2 mb-4 text-sm font-bold">
          <span>🔒</span>
          <span>확인완료 — 읽기 전용</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div><span className="text-gray-500">등록자</span><br /><strong>{record.input_by}</strong></div>
        <div><span className="text-gray-500">등록일</span><br /><strong>{record.created_at.slice(0, 10)}</strong></div>
        {isConfirmed && (
          <>
            <div><span className="text-gray-500">확인자</span><br /><strong>{record.confirmed_by || '-'}</strong></div>
            <div><span className="text-gray-500">확인일</span><br /><strong>{record.confirmed_at?.slice(0, 10) || '-'}</strong></div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2">
          <label className="text-xs text-gray-600 font-medium mb-1 block">물품명</label>
          <input type="text" value={itemName} onChange={e => setItemName(e.target.value)}
            disabled={isConfirmed} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">규격</label>
          <input type="text" value={spec} onChange={e => setSpec(e.target.value)}
            disabled={isConfirmed} placeholder="선택 입력" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">소모수량</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
            disabled={isConfirmed} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">사용일</label>
          <input type="date" value={usedDate} onChange={e => setUsedDate(e.target.value)}
            disabled={isConfirmed} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">사용처</label>
          <input type="text" value={usedLocation} onChange={e => setUsedLocation(e.target.value)}
            disabled={isConfirmed} placeholder="예: 6호관 3층" className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-600 font-medium mb-1 block">메모</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            disabled={isConfirmed} placeholder="자유 입력" className={inputCls} />
        </div>
      </div>

      {sheetResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-4 ${
          sheetResult === 'matched' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span>{sheetResult === 'matched' ? '✓' : '!'}</span>
          <span>{sheetResult === 'matched' ? '관리대장 자동 입력됨' : '관리대장 미매칭 — 입고대기 시트 확인 필요'}</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {!isConfirmed && (
          <>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || confirming}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-60"
            >
              {saveStatus === 'saving' ? '저장 중...' : '저장'}
            </button>
            {saveStatus === 'saved' && <span className="text-sm text-green-600 font-medium">저장됨 ✓</span>}
            {saveStatus === 'error' && <span className="text-sm text-red-500">{saveError || '저장 실패'}</span>}

            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {confirming ? '처리 중...' : `확인 처리 (${CONSUMPTION_STATUS_LABEL.confirmed}로 변경)`}
            </button>
          </>
        )}

        <button onClick={onClose}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition">닫기</button>
      </div>
    </div>
  )
}
