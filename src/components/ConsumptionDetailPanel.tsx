'use client'

import { useState } from 'react'
import type { ConsumptionRecord } from '@/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  record: ConsumptionRecord
  onUpdate: (updated: ConsumptionRecord) => void
  onFieldSave: (updated: ConsumptionRecord) => void
  onDelete: (id: string) => void
}

type EditingField = 'input_by' | 'item_name' | 'qty_spec' | 'loc_note' | 'used_date' | null

async function safeJson(res: Response): Promise<{ ok: boolean; data: any }> {
  const text = await res.text()
  try {
    return { ok: res.ok, data: JSON.parse(text) }
  } catch {
    const snippet = text.slice(0, 120).replace(/<[^>]+>/g, '').trim()
    return { ok: false, data: { error: `서버 오류 (${res.status})${snippet ? ': ' + snippet : ''}` } }
  }
}

const editInputCls = 'flex-1 border border-orange-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500'
const pencilCls = 'text-orange-400 hover:text-orange-600 text-sm leading-none transition shrink-0'
const confirmCls = 'text-green-600 hover:text-green-700 text-sm leading-none transition shrink-0'
const cancelCls = 'text-gray-400 hover:text-red-500 text-sm leading-none transition shrink-0'

export default function ConsumptionDetailPanel({ record, onUpdate, onFieldSave, onDelete }: Props) {
  const [editingField, setEditingField] = useState<EditingField>(null)
  const [savingField, setSavingField] = useState(false)

  const [draftInputBy, setDraftInputBy]     = useState('')
  const [draftItemName, setDraftItemName]   = useState('')
  const [draftQuantity, setDraftQuantity]   = useState('')
  const [draftSpec, setDraftSpec]           = useState('')
  const [draftUsedLocation, setDraftUsedLocation] = useState('')
  const [draftNote, setDraftNote]           = useState('')
  const [draftUsedDate, setDraftUsedDate]   = useState('')

  const [confirming, setConfirming] = useState(false)
  const [reverting, setReverting]   = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [sheetResult, setSheetResult] = useState<'matched' | 'unmatched' | null>(null)
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const isConfirmed = record.status === 'confirmed'

  const startEdit = (field: EditingField) => {
    setDraftInputBy(record.input_by)
    setDraftItemName(record.item_name)
    setDraftQuantity(record.quantity.toString())
    setDraftSpec(record.spec || '')
    setDraftUsedLocation(record.used_location || '')
    setDraftNote(record.note || '')
    setDraftUsedDate(record.used_date)
    setEditingField(field)
  }

  const cancelEdit = () => setEditingField(null)

  // 필드 단위 즉시 저장
  const saveFields = async (fields: Record<string, any>) => {
    setSavingField(true)
    try {
      const res = await fetch('/api/consumption', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [record.id], ...fields }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '저장 실패')
      onFieldSave(data.data[0])
      setEditingField(null)
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setSavingField(false)
    }
  }

  const saveInputBy    = () => saveFields({ input_by: draftInputBy })
  const saveItemName   = () => saveFields({ item_name: draftItemName })
  const saveQtySpec    = () => saveFields({ quantity: parseInt(draftQuantity) || 1, spec: draftSpec || null })
  const saveLocNote    = () => saveFields({ used_location: draftUsedLocation || null, note: draftNote || null })
  const saveUsedDate   = () => saveFields({ used_date: draftUsedDate })

  const handleEnterKey = (e: React.KeyboardEvent, onConfirm: () => void) => {
    if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  // 확인 처리 — status를 confirmed로 변경 + 시트 웹훅 호출
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
          status: 'confirmed',
          confirmed_by: confirmedBy,
          confirmed_at: confirmedAt,
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '확인 처리 실패')
      const updated = data.data[0]
      onUpdate(updated)

      // 시트 반영 웹훅 — 정산완료(RequestDetailPanel)와 동일하게 클라이언트에서 프록시 직접 호출
      setSheetResult(null)
      const webhookPayload = {
        type: 'consumption',
        item_name: updated.item_name,
        spec: updated.spec || '',
        quantity: updated.quantity,
        used_date: updated.used_date,
        used_location: updated.used_location || '',
        input_by: updated.input_by || '',
        confirmed_at: updated.confirmed_at || confirmedAt,
        note: updated.note || '',
      }
      fetch('/api/admin/sheet-webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      }).then(r => r.json()).then(d => setSheetResult(d.matched ? 'matched' : 'unmatched')).catch(() => setSheetResult('unmatched'))
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setConfirming(false)
    }
  }

  // 대기로 되돌리기 — status만 pending으로 변경, 시트는 건드리지 않음
  const handleRevert = async () => {
    setShowRevertModal(false)
    setReverting(true)
    try {
      const res = await fetch('/api/consumption', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [record.id], status: 'pending' }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '되돌리기 실패')
      onUpdate(data.data[0])
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setReverting(false)
    }
  }

  // 삭제 — Supabase에서 완전 삭제, 시트는 건드리지 않음
  const handleDelete = async () => {
    setShowDeleteModal(false)
    setDeleting(true)
    try {
      const res = await fetch('/api/consumption', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [record.id] }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '삭제 실패')
      onDelete(record.id)
    } catch (err: any) {
      alert('오류: ' + err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mx-2 mb-2">

      {isConfirmed && (
        <div className="flex items-center gap-2 bg-[#EDE900] text-[#3a3800] rounded-lg px-2.5 py-1.5 mb-4 text-xs font-bold w-fit">
          <span>✅</span>
          <span>확인완료 — 저장해도 시트에는 재전송되지 않습니다</span>
        </div>
      )}

      <div className="space-y-2.5 mb-4 text-sm">

        {/* 등록일 / 확인자·확인일 (읽기 전용) */}
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-gray-500">등록일</span><br /><strong>{record.created_at.slice(0, 10)}</strong></div>
          {isConfirmed && (
            <>
              <div><span className="text-gray-500">확인자</span><br /><strong>{record.confirmed_by || '-'}</strong></div>
              <div><span className="text-gray-500">확인일</span><br /><strong>{record.confirmed_at?.slice(0, 10) || '-'}</strong></div>
            </>
          )}
        </div>

        {/* 이름 */}
        <div>
          <p className="text-xs text-gray-500">이름</p>
          <div className="flex items-center gap-1">
            {editingField === 'input_by' ? (
              <>
                <input autoFocus value={draftInputBy} onChange={e => setDraftInputBy(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveInputBy)}
                  disabled={savingField} className={editInputCls} />
                <button type="button" onClick={saveInputBy} disabled={savingField} className={confirmCls} title="저장">✓</button>
                <button type="button" onClick={cancelEdit} disabled={savingField} className={cancelCls} title="취소">✕</button>
              </>
            ) : (
              <>
                <strong className="flex-1">{record.input_by}</strong>
                <button type="button" onClick={() => startEdit('input_by')} className={pencilCls} title="이름 편집">✏️</button>
              </>
            )}
          </div>
        </div>

        {/* 물품명 */}
        <div>
          <p className="text-xs text-gray-500">물품명</p>
          <div className="flex items-center gap-1">
            {editingField === 'item_name' ? (
              <>
                <input autoFocus value={draftItemName} onChange={e => setDraftItemName(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveItemName)}
                  disabled={savingField} className={editInputCls} />
                <button type="button" onClick={saveItemName} disabled={savingField} className={confirmCls} title="저장">✓</button>
                <button type="button" onClick={cancelEdit} disabled={savingField} className={cancelCls} title="취소">✕</button>
              </>
            ) : (
              <>
                <strong className="flex-1">{record.item_name}</strong>
                <button type="button" onClick={() => startEdit('item_name')} className={pencilCls} title="물품명 편집">✏️</button>
              </>
            )}
          </div>
        </div>

        {/* 소모수량 · 규격 */}
        <div>
          <p className="text-xs text-gray-500">소모수량 · 규격</p>
          <div className="flex items-center gap-1">
            {editingField === 'qty_spec' ? (
              <>
                <input autoFocus type="number" min="1" value={draftQuantity} onChange={e => setDraftQuantity(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveQtySpec)}
                  disabled={savingField} style={{ width: '72px' }}
                  className="border border-orange-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500" />
                <input value={draftSpec} onChange={e => setDraftSpec(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveQtySpec)}
                  disabled={savingField} placeholder="규격 입력" className={editInputCls} />
                <button type="button" onClick={saveQtySpec} disabled={savingField} className={confirmCls} title="저장">✓</button>
                <button type="button" onClick={cancelEdit} disabled={savingField} className={cancelCls} title="취소">✕</button>
              </>
            ) : (
              <>
                <strong className="flex-1">
                  {record.quantity}
                  {record.spec
                    ? <span className="text-gray-500 font-normal"> · {record.spec}</span>
                    : <span className="text-gray-400 font-normal text-xs"> · 규격 미입력</span>}
                </strong>
                <button type="button" onClick={() => startEdit('qty_spec')} className={pencilCls} title="수량·규격 편집">✏️</button>
              </>
            )}
          </div>
        </div>

        {/* 사용처 · 메모 */}
        <div>
          <p className="text-xs text-gray-500">사용처 · 메모</p>
          <div className="flex items-center gap-1">
            {editingField === 'loc_note' ? (
              <>
                <input autoFocus value={draftUsedLocation} onChange={e => setDraftUsedLocation(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveLocNote)}
                  disabled={savingField} placeholder="사용처" className={editInputCls} />
                <input value={draftNote} onChange={e => setDraftNote(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveLocNote)}
                  disabled={savingField} placeholder="메모" className={editInputCls} />
                <button type="button" onClick={saveLocNote} disabled={savingField} className={confirmCls} title="저장">✓</button>
                <button type="button" onClick={cancelEdit} disabled={savingField} className={cancelCls} title="취소">✕</button>
              </>
            ) : (
              <>
                <strong className="flex-1">
                  {record.used_location || <span className="text-gray-400 font-normal text-xs">사용처 미입력</span>}
                  {record.note && <span className="text-gray-500 font-normal"> · {record.note}</span>}
                </strong>
                <button type="button" onClick={() => startEdit('loc_note')} className={pencilCls} title="사용처·메모 편집">✏️</button>
              </>
            )}
          </div>
        </div>

        {/* 사용일 */}
        <div>
          <p className="text-xs text-gray-500">사용일</p>
          <div className="flex items-center gap-1">
            {editingField === 'used_date' ? (
              <>
                <input autoFocus type="date" value={draftUsedDate} onChange={e => setDraftUsedDate(e.target.value)}
                  onKeyDown={e => handleEnterKey(e, saveUsedDate)}
                  disabled={savingField} className={editInputCls} />
                <button type="button" onClick={saveUsedDate} disabled={savingField} className={confirmCls} title="저장">✓</button>
                <button type="button" onClick={cancelEdit} disabled={savingField} className={cancelCls} title="취소">✕</button>
              </>
            ) : (
              <>
                <strong className="flex-1">{record.used_date}</strong>
                <button type="button" onClick={() => startEdit('used_date')} className={pencilCls} title="사용일 편집">✏️</button>
              </>
            )}
          </div>
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
        {!isConfirmed ? (
          <button
            onClick={handleConfirm}
            disabled={confirming || deleting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
          >
            {confirming ? '처리 중...' : '확인 처리'}
          </button>
        ) : (
          <button
            onClick={() => setShowRevertModal(true)}
            disabled={reverting || deleting}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-60"
          >
            {reverting ? '처리 중...' : '대기로 되돌리기'}
          </button>
        )}

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={deleting || confirming || reverting}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
        >
          {deleting ? '삭제 중...' : '삭제'}
        </button>
      </div>

      {/* 대기로 되돌리기 확인 모달 */}
      {showRevertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRevertModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-2">대기로 되돌리기</h3>
            <p className="text-sm text-gray-600 mb-5">이 항목을 대기 상태로 되돌리겠습니까?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowRevertModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">취소</button>
              <button onClick={handleRevert}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition">되돌리기</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-red-700 mb-2">⚠️ 삭제 확인</h3>
            <p className="text-sm text-gray-700 mb-1">삭제하면 복구할 수 없습니다.</p>
            <p className="text-sm text-gray-700 mb-5">삭제하시겠습니까?</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">취소</button>
              <button onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
