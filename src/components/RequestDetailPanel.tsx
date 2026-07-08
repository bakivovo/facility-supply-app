'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import type { Request, ReceiptPhoto } from '@/types'
import { STATUS_LABEL, STATUS_FLOW, NEXT_STATUS_LABEL } from '@/types'
import { uploadToStorage, uploadManyToStorage, deleteFromStorage } from '@/lib/uploadToStorage'

interface Props {
  request: Request
  vendors: { id: string; name: string }[]
  onUpdate: (updated: Request) => void
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

// ─── 사진 컬럼 (라벨 + 드롭존 + 썸네일 그리드) ───
interface PhotoColumnProps {
  label: string
  items: Array<{ url: string }>
  editable: boolean
  onDropFiles: (files: File[]) => void
  onRemove: (index: number) => void
}

function PhotoColumn({ label, items, editable, onDropFiles, onRemove }: PhotoColumnProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) onDropFiles(acceptedFiles)
  }, [onDropFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    disabled: !editable,
  })

  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{label}</p>

      {editable && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg px-2 py-3 text-center cursor-pointer transition mb-1.5 ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'
          }`}
        >
          <input {...getInputProps()} />
          <p className="text-[11px] text-gray-400 leading-tight">
            {isDragActive ? '여기에 놓으세요' : '클릭 또는 드래그'}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {items.map((item, i) => (
            <div key={i} className="relative aspect-square rounded border overflow-hidden group bg-white">
              <a href={item.url} target="_blank" rel="noreferrer">
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              </a>
              {editable && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500"
                  title="사진 삭제"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 메인 패널 ───
export default function RequestDetailPanel({ request, vendors, onUpdate, onClose }: Props) {
  const [editItemName, setEditItemName] = useState(request.item_name)
  const [editSpec, setEditSpec] = useState(request.spec || '')
  const [editingField, setEditingField] = useState<'item_name' | 'spec' | null>(null)

  const [vendorInput, setVendorInput] = useState(request.vendor || '')
  const [unitPrice, setUnitPrice] = useState(request.unit_price?.toString() || '')
  const [purchaseQty, setPurchaseQty] = useState(
    request.purchase_quantity != null ? request.purchase_quantity.toString() : (request.quantity?.toString() || '1')
  )
  const [shippingFee, setShippingFee] = useState(request.shipping_fee?.toString() || '')
  const calcAmount = (parseInt(unitPrice || '0') || 0) * (parseInt(purchaseQty || '0') || 0)
  const amount = calcAmount > 0 ? calcAmount.toString() : (request.amount?.toString() || '')
  const [purchaseDate, setPurchaseDate] = useState(request.purchase_date || '')
  const [memo, setMemo] = useState(request.memo || '')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState(false)

  // 납품완료 사진
  const [deliveryItems, setDeliveryItems] = useState<Array<{ url: string; file?: File }>>(
    (request.delivery_photo_urls || []).map(url => ({ url }))
  )
  // 물건 영수증 사진 (label 포함 구조 유지 — 기존 데이터 호환)
  const [receiptPhotos, setReceiptPhotos] = useState<Array<{ label: string; file?: File; url?: string }>>(
    ((request.receipt_photo_urls as ReceiptPhoto[]) || []).map(r => ({ label: r.label, url: r.url }))
  )
  // 배송료 영수증 사진
  const [deliveryReceiptItems, setDeliveryReceiptItems] = useState<Array<{ url: string; file?: File }>>(
    (request.delivery_receipt_photo_urls || []).map(url => ({ url }))
  )

  const [excelLoading, setExcelLoading] = useState<'delivery' | 'receipt' | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [sheetResult, setSheetResult] = useState<'matched' | 'unmatched' | null>(null)

  const isSettled = request.status === 'settled'
  const isOrdered = request.status === 'ordered'
  const showPhotoSection = isOrdered || isSettled

  // ─── 저장 ───
  const handleSave = async () => {
    setSaveStatus('saving'); setSaveError('')
    try {
      // 납품 사진
      const origDelivery = request.delivery_photo_urls || []
      const keptDelivery = deliveryItems.filter(i => !i.file).map(i => i.url)
      await Promise.all(origDelivery.filter(u => !keptDelivery.includes(u)).map(u => deleteFromStorage(u, 'delivery-photos')))
      const newDelivery: string[] = []
      for (const item of deliveryItems.filter(i => !!i.file)) {
        newDelivery.push(await uploadToStorage(item.file!, 'delivery-photos'))
      }
      const finalDelivery = [...keptDelivery, ...newDelivery]

      // 물건 영수증
      const origReceipt = ((request.receipt_photo_urls as ReceiptPhoto[]) || []).map(r => r.url)
      const keptReceipt = receiptPhotos.filter(rp => rp.url && !rp.file).map(rp => rp.url!)
      await Promise.all(origReceipt.filter(u => !keptReceipt.includes(u)).map(u => deleteFromStorage(u, 'receipt-photos')))
      const finalReceipt: ReceiptPhoto[] = []
      for (const rp of receiptPhotos) {
        if (rp.file) finalReceipt.push({ label: rp.label, url: await uploadToStorage(rp.file, 'receipt-photos') })
        else if (rp.url) finalReceipt.push({ label: rp.label, url: rp.url })
      }

      // 배송료 영수증
      const origDR = request.delivery_receipt_photo_urls || []
      const keptDR = deliveryReceiptItems.filter(i => !i.file).map(i => i.url)
      await Promise.all(origDR.filter(u => !keptDR.includes(u)).map(u => deleteFromStorage(u, 'delivery-receipt-photos')))
      const newDR: string[] = []
      for (const item of deliveryReceiptItems.filter(i => !!i.file)) {
        newDR.push(await uploadToStorage(item.file!, 'delivery-receipt-photos'))
      }
      const finalDR = [...keptDR, ...newDR]

      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [request.id],
          item_name: editItemName || null,
          spec: editSpec || null,
          vendor: vendorInput || null,
          unit_price: unitPrice ? parseInt(unitPrice) : null,
          purchase_quantity: purchaseQty ? parseInt(purchaseQty) : null,
          amount: calcAmount > 0 ? calcAmount : (request.amount ?? null),
          shipping_fee: shippingFee ? parseInt(shippingFee) : null,
          purchase_date: purchaseDate || null,
          memo: memo || null,
          delivery_photo_urls: finalDelivery,
          receipt_photo_urls: finalReceipt,
          delivery_receipt_photo_urls: finalDR,
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '저장 실패')

      setDeliveryItems((data.data[0].delivery_photo_urls || []).map((u: string) => ({ url: u })))
      setReceiptPhotos(((data.data[0].receipt_photo_urls as ReceiptPhoto[]) || []).map((r: ReceiptPhoto) => ({ label: r.label, url: r.url })))
      setDeliveryReceiptItems((data.data[0].delivery_receipt_photo_urls || []).map((u: string) => ({ url: u })))
      setEditingField(null)
      onUpdate(data.data[0])
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (err: any) {
      setSaveError(err.message); setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }

  // ─── 다음 단계 ───
  const handleNextStatus = async () => {
    const nextStatus = STATUS_FLOW[request.status]
    if (!nextStatus) return
    setLoading(true)
    try {
      let deliveryUrls = request.delivery_photo_urls || []
      let receiptUrls: ReceiptPhoto[] = (request.receipt_photo_urls as ReceiptPhoto[]) || []
      let drUrls = request.delivery_receipt_photo_urls || []

      if (nextStatus === 'settled') {
        const keptD = deliveryItems.filter(i => !i.file).map(i => i.url)
        const newDFiles = deliveryItems.filter(i => !!i.file).map(i => i.file!)
        deliveryUrls = [...keptD, ...(newDFiles.length > 0 ? await uploadManyToStorage(newDFiles, 'delivery-photos') : [])]

        const newR: ReceiptPhoto[] = []
        for (const rp of receiptPhotos) {
          if (rp.file) newR.push({ label: rp.label, url: await uploadToStorage(rp.file, 'receipt-photos') })
          else if (rp.url) newR.push({ label: rp.label, url: rp.url })
        }
        receiptUrls = newR

        const keptDR = deliveryReceiptItems.filter(i => !i.file).map(i => i.url)
        const newDRFiles = deliveryReceiptItems.filter(i => !!i.file).map(i => i.file!)
        drUrls = [...keptDR, ...(newDRFiles.length > 0 ? await uploadManyToStorage(newDRFiles, 'delivery-receipt-photos') : [])]
      }

      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [request.id],
          status: nextStatus,
          vendor: vendorInput || null,
          unit_price: unitPrice ? parseInt(unitPrice) : null,
          purchase_quantity: purchaseQty ? parseInt(purchaseQty) : null,
          amount: calcAmount > 0 ? calcAmount : (amount ? parseInt(amount) : null),
          shipping_fee: shippingFee ? parseInt(shippingFee) : null,
          purchase_date: purchaseDate || null,
          memo: memo || null,
          ...(nextStatus === 'settled' && {
            delivery_photo_urls: deliveryUrls,
            receipt_photo_urls: receiptUrls,
            delivery_receipt_photo_urls: drUrls,
          }),
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '상태 변경 실패')
      onUpdate(data.data[0])

      if (nextStatus === 'settled') {
        setSheetResult(null)
        const u = data.data[0]
        fetch('/api/admin/sheet-webhook', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt_number: u.receipt_number, item_name: u.item_name, spec: u.spec, purchase_quantity: u.purchase_quantity ?? u.quantity, purchase_date: u.purchase_date }),
        }).then(r => r.json()).then(d => setSheetResult(d.matched ? 'matched' : 'unmatched')).catch(() => setSheetResult('unmatched'))
      }
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── 반려 ───
  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('반려 사유를 입력해주세요.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [request.id], status: 'rejected', reject_reason: rejectReason }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '반려 처리 실패')
      onUpdate(data.data[0])
    } catch (err: any) { alert('오류: ' + err.message) } finally { setLoading(false) }
  }

  // ─── 엑셀 다운로드 ───
  const handleExcel = async (type: 'delivery' | 'receipt') => {
    setExcelLoading(type)
    try {
      const endpoint = type === 'delivery' ? '/api/excel/delivery' : '/api/excel/receipt'
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_number: request.receipt_number, item_name: request.item_name,
          delivery_photo_urls: type === 'delivery' ? (request.delivery_photo_urls || []) : undefined,
          receipt_photo_urls: type === 'receipt' ? (request.receipt_photo_urls || []) : undefined,
        }),
      })
      if (!res.ok) { const { data } = await safeJson(res); throw new Error(data.error || '엑셀 생성 실패') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `${request.receipt_number}_${type === 'delivery' ? '납품완료사진' : '영수증사진'}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch (err: any) { alert('오류: ' + err.message) } finally { setExcelLoading(null) }
  }

  const inputCls = isSettled
    ? 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed'
    : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const totalSum = calcAmount + (parseInt(shippingFee || '0') || 0)

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mx-2 mb-2">

      {/* ══ 정산완료 배지 ══ */}
      {isSettled && (
        <div className="flex items-center gap-2 bg-[#EDE900] text-[#3a3800] rounded-lg px-3 py-2 mb-4 text-sm font-bold">
          <span>🔒</span>
          <span>정산완료 — 읽기 전용</span>
        </div>
      )}

      {/* ══ 상단 정보 영역: 2컬럼 ══ */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-0 text-sm">

        {/* 왼쪽 컬럼 */}
        <div className="space-y-2.5">
          <div>
            <p className="text-xs text-gray-500">요청자</p>
            <strong>{request.requester_name}</strong>
          </div>

          {/* 물품명 — 인라인 편집 */}
          <div>
            <p className="text-xs text-gray-500">물품명</p>
            <div className="flex items-start gap-1">
              {editingField === 'item_name' ? (
                <input autoFocus value={editItemName} onChange={e => setEditItemName(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  className="flex-1 border border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ) : (
                <strong className="flex-1">{editItemName}</strong>
              )}
              {!isSettled && editingField !== 'item_name' && (
                <button type="button" onClick={() => setEditingField('item_name')}
                  className="text-gray-300 hover:text-blue-500 text-sm leading-none transition shrink-0" title="물품명 편집">✏️</button>
              )}
            </div>
          </div>

          {/* 수량 + 규격 한 줄 */}
          <div>
            <p className="text-xs text-gray-500">수량 · 규격</p>
            <div className="flex items-start gap-1">
              {editingField === 'spec' ? (
                <div className="flex-1 flex items-center gap-2">
                  <strong className="shrink-0">{request.quantity} {request.unit}</strong>
                  <input autoFocus value={editSpec} onChange={e => setEditSpec(e.target.value)}
                    onBlur={() => setEditingField(null)} placeholder="규격 입력"
                    className="flex-1 border border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ) : (
                <strong className="flex-1">
                  {request.quantity} {request.unit}
                  {editSpec
                    ? <span className="text-gray-500 font-normal"> · {editSpec}</span>
                    : <span className="text-gray-400 font-normal text-xs"> · 규격 미입력</span>}
                </strong>
              )}
              {!isSettled && editingField !== 'spec' && (
                <button type="button" onClick={() => setEditingField('spec')}
                  className="text-gray-300 hover:text-blue-500 text-sm leading-none transition shrink-0" title="규격 편집">✏️</button>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500">용도/사유</p>
            <strong>{request.purpose}</strong>
          </div>

          {request.purchase_link && (
            <div>
              <a href={request.purchase_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs break-all">
                🔗 구입 참고 링크
              </a>
            </div>
          )}
        </div>

        {/* 오른쪽 컬럼 */}
        <div className="space-y-2.5">
          <div>
            <p className="text-xs text-gray-500">접수일</p>
            <strong>{request.created_at.slice(0, 10)}</strong>
          </div>

          {(isOrdered || isSettled) && (
            <div>
              <p className="text-xs text-gray-500">구입일</p>
              {isSettled ? (
                <strong>{request.purchase_date || '-'}</strong>
              ) : (
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500">카테고리</p>
            <strong>{request.category}</strong>
          </div>
        </div>
      </div>

      {/* 요청 첨부 사진 */}
      {request.request_photos && request.request_photos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">첨부 사진</p>
          <div className="flex gap-2 flex-wrap">
            {request.request_photos.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ══ 상태 흐름 ══ */}
      <div className="flex items-center gap-1 mt-4 pt-4 border-t border-gray-200 overflow-x-auto">
        {(['new', 'reviewing', 'ordered', 'settled'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-semibold ${
              request.status === s ? 'bg-blue-600 text-white'
              : ['new', 'reviewing', 'ordered', 'settled'].indexOf(request.status) > i ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-400'
            }`}>{STATUS_LABEL[s]}</span>
            {i < 3 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {/* ══ 구입 정보 영역 ══ */}
      {request.status !== 'rejected' && (
        <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {/* 왼쪽: 구입처, 구입수량 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">구입처</label>
              <input list="vendor-list" value={vendorInput} onChange={e => setVendorInput(e.target.value)}
                disabled={isSettled} placeholder="구입처 입력 또는 선택" className={inputCls} />
              {!isSettled && (
                <datalist id="vendor-list">
                  {vendors.map(v => <option key={v.id} value={v.name} />)}
                </datalist>
              )}
            </div>

            {/* 오른쪽: 단가 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">단가 (원)</label>
              <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                disabled={isSettled} placeholder="0" className={inputCls} />
            </div>

            {/* 왼쪽: 구입수량 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">
                구입수량
                {!isSettled && request.purchase_quantity == null && (
                  <span className="text-gray-400 font-normal ml-1">(요청: {request.quantity}{request.unit})</span>
                )}
              </label>
              <input type="number" value={purchaseQty} onChange={e => setPurchaseQty(e.target.value)}
                disabled={isSettled} min="1" placeholder="1" className={inputCls} />
            </div>

            {/* 오른쪽: 배송비 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">
                배송비 (원) {!isSettled && <span className="text-gray-400 font-normal">선택</span>}
              </label>
              <input type="number" value={shippingFee} onChange={e => setShippingFee(e.target.value)}
                disabled={isSettled} placeholder="0" className={inputCls} />
            </div>
          </div>

          {/* 구입금액 · 합계 — 한 줄 */}
          {(calcAmount > 0 || (isSettled && request.amount != null)) && (
            <div className="flex items-center gap-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-sm">
              <div>
                <span className="text-gray-500">구입금액 </span>
                <span className="font-semibold text-gray-800">
                  {(isSettled ? (request.amount ?? 0) : calcAmount).toLocaleString()}원
                </span>
                {!isSettled && calcAmount > 0 && (
                  <span className="text-gray-400 text-xs ml-1">
                    ({parseInt(unitPrice || '0').toLocaleString()} × {parseInt(purchaseQty || '0')})
                  </span>
                )}
              </div>
              <div className="w-px h-4 bg-blue-200" />
              <div>
                <span className="text-gray-500">합계 </span>
                <span className="font-bold text-blue-700">
                  {(isSettled
                    ? (request.amount ?? 0) + (request.shipping_fee ?? 0)
                    : totalSum
                  ).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 메모 — 전체 너비 */}
          <div>
            <label className="text-xs text-gray-600 font-medium mb-1 block">메모</label>
            <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
              disabled={isSettled} placeholder="자유 입력" className={inputCls} />
          </div>
        </div>
      )}

      {/* ══ 사진 영역: 3칸 가로 배치 ══ */}
      {request.status !== 'rejected' && showPhotoSection && (() => {
        const columns = [
          {
            label: '납품완료 사진',
            items: deliveryItems.map(i => ({ url: i.url })),
            onDropFiles: (files: File[]) =>
              setDeliveryItems(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), file: f }))]),
            onRemove: (idx: number) => setDeliveryItems(prev => prev.filter((_, i) => i !== idx)),
          },
          {
            label: '물건 영수증',
            items: receiptPhotos.filter(rp => rp.url).map(rp => ({ url: rp.url! })),
            onDropFiles: (files: File[]) =>
              setReceiptPhotos(prev => [...prev, ...files.map(f => ({ label: '물건 영수증', url: URL.createObjectURL(f), file: f }))]),
            onRemove: (idx: number) => {
              setReceiptPhotos(prev => {
                const withUrl = prev.filter(rp => rp.url)
                const target = withUrl[idx]
                return prev.filter(rp => rp !== target)
              })
            },
          },
          {
            label: '배송료 영수증',
            items: deliveryReceiptItems.map(i => ({ url: i.url })),
            onDropFiles: (files: File[]) =>
              setDeliveryReceiptItems(prev => [...prev, ...files.map(f => ({ url: URL.createObjectURL(f), file: f }))]),
            onRemove: (idx: number) => setDeliveryReceiptItems(prev => prev.filter((_, i) => i !== idx)),
          },
        ]
        const visible = isSettled ? columns.filter(c => c.items.length > 0) : columns
        if (visible.length === 0) return null
        return (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-3 gap-3">
              {visible.map(col => (
                <PhotoColumn
                  key={col.label}
                  label={col.label}
                  items={col.items}
                  editable={!isSettled}
                  onDropFiles={col.onDropFiles}
                  onRemove={col.onRemove}
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* ══ 구글시트 연동 결과 ══ */}
      {sheetResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mt-4 ${
          sheetResult === 'matched' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span>{sheetResult === 'matched' ? '✓' : '!'}</span>
          <span>{sheetResult === 'matched' ? '관리대장 자동 입력됨' : '관리대장 미매칭 — 입고대기 시트 확인 필요'}</span>
        </div>
      )}

      {/* ══ 정산완료 엑셀 다운로드 ══ */}
      {isSettled && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200 flex-wrap">
          {request.delivery_photo_urls && request.delivery_photo_urls.length > 0 && (
            <button onClick={() => handleExcel('delivery')} disabled={excelLoading === 'delivery'}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60">
              {excelLoading === 'delivery' ? '생성 중...' : '📥 납품사진 엑셀'}
            </button>
          )}
          {request.receipt_photo_urls && (request.receipt_photo_urls as ReceiptPhoto[]).length > 0 && (
            <button onClick={() => handleExcel('receipt')} disabled={excelLoading === 'receipt'}
              className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 transition disabled:opacity-60">
              {excelLoading === 'receipt' ? '생성 중...' : '📥 영수증 엑셀'}
            </button>
          )}
        </div>
      )}

      {/* ══ 버튼 영역 ══ */}
      {request.status !== 'rejected' && (
        <div className="flex gap-2 flex-wrap items-center mt-4 pt-4 border-t border-gray-200">
          <button onClick={handleSave} disabled={saveStatus === 'saving' || loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-60">
            {saveStatus === 'saving' ? '저장 중...' : '저장'}
          </button>
          {saveStatus === 'saved' && <span className="text-sm text-green-600 font-medium">저장됨 ✓</span>}
          {saveStatus === 'error' && <span className="text-sm text-red-500">{saveError || '저장 실패'}</span>}

          {STATUS_FLOW[request.status] && (
            <button onClick={handleNextStatus} disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60">
              {loading ? '처리 중...' : NEXT_STATUS_LABEL[request.status]}
            </button>
          )}

          {!isSettled && (
            !showReject ? (
              <button onClick={() => setShowReject(true)}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition">반려</button>
            ) : (
              <div className="w-full space-y-2">
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="반려 사유를 입력하세요" rows={2}
                  className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                <div className="flex gap-2">
                  <button onClick={handleReject} disabled={loading}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60">
                    {loading ? '처리 중...' : '반려 확정'}
                  </button>
                  <button onClick={() => setShowReject(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">취소</button>
                </div>
              </div>
            )
          )}

          <button onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition">닫기</button>
        </div>
      )}

      {request.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4">
          <p className="text-sm font-semibold text-red-700">반려 처리됨</p>
          {request.reject_reason && <p className="text-sm text-red-600 mt-1">사유: {request.reject_reason}</p>}
        </div>
      )}
    </div>
  )
}
