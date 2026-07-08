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

// ─── 영수증 카드 드롭존 ───
interface ReceiptCardProps {
  index: number; label: string; url?: string
  onLabelChange: (label: string) => void
  onFileDrop: (file: File, previewUrl: string) => void
  onRemove: () => void; onRemovePhoto: () => void
}

function ReceiptDropzoneCard({ index, label, url, onLabelChange, onFileDrop, onRemove, onRemovePhoto }: ReceiptCardProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]; if (!file) return
    onFileDrop(file, URL.createObjectURL(file))
  }, [onFileDrop])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, multiple: false, noClick: !!url })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-medium w-5 shrink-0">{index + 1}</span>
        <input type="text" value={label} onChange={e => onLabelChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <button type="button" onClick={onRemove} className="text-gray-300 hover:text-red-400 text-base leading-none" title="삭제">×</button>
      </div>
      <div {...getRootProps()} style={{ minHeight: '96px' }}
        className={`relative rounded-lg border-2 border-dashed transition cursor-pointer ${isDragActive ? 'border-blue-500 bg-blue-50' : url ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'}`}>
        <input {...getInputProps()} />
        {url ? (
          <div className="flex items-center gap-3 p-2">
            <div className="relative group shrink-0">
              <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
              </a>
              <button type="button" onClick={e => { e.stopPropagation(); onRemovePhoto() }}
                className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500" title="사진 삭제">×</button>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">사진이 선택되었습니다.</p>
              <label className="cursor-pointer text-xs text-blue-600 hover:underline">다시 선택
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFileDrop(f, URL.createObjectURL(f)) }} />
              </label>
              <p className="text-xs text-gray-400">또는 사진을 드래그</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-4 gap-1">
            <span className="text-2xl text-gray-300">📄</span>
            <p className="text-xs text-gray-400">{isDragActive ? '여기에 놓으세요' : '클릭하거나 사진을 드래그'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 읽기 전용 사진 그리드 ───
function ReadOnlyPhotoGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <div className="grid grid-cols-6 gap-1">
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noreferrer">
          <div className="aspect-square rounded border overflow-hidden">
            <img src={url} alt="" className="w-full h-full object-cover" />
          </div>
        </a>
      ))}
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
  // 영수증 사진
  const [receiptPhotos, setReceiptPhotos] = useState<Array<{ label: string; file?: File; url?: string }>>(
    request.receipt_photo_urls && (request.receipt_photo_urls as ReceiptPhoto[]).length > 0
      ? (request.receipt_photo_urls as ReceiptPhoto[]).map(r => ({ label: r.label, url: r.url }))
      : [{ label: '물건 영수증' }, { label: '배송료 영수증' }]
  )
  // 배송비 영수증 사진
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

  // 드롭존 — 납품 사진
  const onDropDelivery = useCallback((acceptedFiles: File[]) => {
    setDeliveryItems(prev => [...prev, ...acceptedFiles.map(f => ({ url: URL.createObjectURL(f), file: f }))])
  }, [])
  const { getRootProps: getDeliveryRootProps, getInputProps: getDeliveryInputProps, isDragActive: isDeliveryDrag } =
    useDropzone({ onDrop: onDropDelivery, accept: { 'image/*': [] }, multiple: true })

  // 드롭존 — 배송비 영수증
  const onDropDeliveryReceipt = useCallback((acceptedFiles: File[]) => {
    setDeliveryReceiptItems(prev => [...prev, ...acceptedFiles.map(f => ({ url: URL.createObjectURL(f), file: f }))])
  }, [])
  const { getRootProps: getDeliveryReceiptRootProps, getInputProps: getDeliveryReceiptInputProps, isDragActive: isDeliveryReceiptDrag } =
    useDropzone({ onDrop: onDropDeliveryReceipt, accept: { 'image/*': [] }, multiple: true })

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

      // 영수증 사진
      const origReceipt = ((request.receipt_photo_urls as ReceiptPhoto[]) || []).map(r => r.url)
      const keptReceipt = receiptPhotos.filter(rp => rp.url && !rp.file).map(rp => rp.url!)
      await Promise.all(origReceipt.filter(u => !keptReceipt.includes(u)).map(u => deleteFromStorage(u, 'receipt-photos')))
      const finalReceipt: ReceiptPhoto[] = []
      for (const rp of receiptPhotos) {
        if (rp.file) finalReceipt.push({ label: rp.label, url: await uploadToStorage(rp.file, 'receipt-photos') })
        else if (rp.url) finalReceipt.push({ label: rp.label, url: rp.url })
      }

      // 배송비 영수증 사진
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
      setReceiptPhotos(
        (data.data[0].receipt_photo_urls as ReceiptPhoto[] || []).length > 0
          ? (data.data[0].receipt_photo_urls as ReceiptPhoto[]).map((r: ReceiptPhoto) => ({ label: r.label, url: r.url }))
          : receiptPhotos.map(rp => ({ label: rp.label, url: rp.url }))
      )
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

  // ─── 공통 input 클래스 ───
  const inputCls = isSettled
    ? 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed'
    : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mx-2 mb-2">

      {/* ── 기본 정보 요약 ── */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">

        {/* 요청자 */}
        <div><span className="text-gray-500">요청자</span><br /><strong>{request.requester_name}</strong></div>

        {/* 날짜: 접수일 + 구입일 */}
        <div className="space-y-1.5">
          <div>
            <span className="text-gray-500 text-xs">접수일</span><br />
            <strong className="text-sm">{request.created_at.slice(0, 10)}</strong>
          </div>
          {(isOrdered || isSettled) && (
            <div>
              <span className="text-gray-500 text-xs">구입일</span><br />
              {isSettled ? (
                <strong className="text-sm">{request.purchase_date || '-'}</strong>
              ) : (
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5"
                />
              )}
            </div>
          )}
        </div>

        {/* 물품명 — 인라인 편집 */}
        <div className="col-span-2">
          <div className="flex items-start gap-1">
            <div className="flex-1">
              <span className="text-gray-500 text-sm">물품명</span><br />
              {editingField === 'item_name' ? (
                <input autoFocus value={editItemName} onChange={e => setEditItemName(e.target.value)}
                  onBlur={() => setEditingField(null)}
                  className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              ) : (
                <strong>{editItemName}</strong>
              )}
            </div>
            {!isSettled && (
              <button type="button" onClick={() => setEditingField('item_name')}
                className="text-gray-300 hover:text-blue-500 text-sm mt-5 leading-none transition" title="물품명 편집">✏️</button>
            )}
          </div>
        </div>

        <div><span className="text-gray-500">수량</span><br /><strong>{request.quantity} {request.unit}</strong></div>

        {/* 규격 — 인라인 편집 */}
        <div className="col-span-2">
          <div className="flex items-start gap-1">
            <div className="flex-1">
              <span className="text-gray-500 text-sm">규격</span><br />
              {editingField === 'spec' ? (
                <input autoFocus value={editSpec} onChange={e => setEditSpec(e.target.value)}
                  onBlur={() => setEditingField(null)} placeholder="규격 입력"
                  className="w-full border border-blue-400 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 mt-0.5" />
              ) : (
                <strong>{editSpec || <span className="text-gray-400 font-normal text-xs">미입력</span>}</strong>
              )}
            </div>
            {!isSettled && (
              <button type="button" onClick={() => setEditingField('spec')}
                className="text-gray-300 hover:text-blue-500 text-sm mt-5 leading-none transition" title="규격 편집">✏️</button>
            )}
          </div>
        </div>

        <div className="col-span-2"><span className="text-gray-500">용도/사유</span><br /><strong>{request.purpose}</strong></div>

        {request.purchase_link && (
          <div className="col-span-2">
            <a href={request.purchase_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs break-all">
              🔗 구입 참고 링크
            </a>
          </div>
        )}
        {request.request_photos && request.request_photos.length > 0 && (
          <div className="col-span-2">
            <p className="text-gray-500 text-xs mb-1">첨부 사진</p>
            <div className="flex gap-2 flex-wrap">
              {request.request_photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 상태 흐름 ── */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
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

      {/* ── 구입 정보 입력 폼 (반려 제외) ── */}
      {request.status !== 'rejected' && (
        <div className="space-y-3 mb-4">
          {isSettled && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span>🔒</span> 정산완료 — 읽기 전용
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* 구입처 */}
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

            {/* 단가 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">단가 (원)</label>
              <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                disabled={isSettled} placeholder="0" className={inputCls} />
            </div>

            {/* 구입수량 */}
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

            {/* 구입금액 자동계산 */}
            {!isSettled && calcAmount > 0 && (
              <div className="col-span-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                  <span className="text-gray-500">구입금액:</span>
                  <span className="font-semibold text-gray-800">{calcAmount.toLocaleString()}원</span>
                  <span className="text-gray-400 text-xs">({parseInt(unitPrice || '0').toLocaleString()} × {parseInt(purchaseQty || '0')})</span>
                </div>
              </div>
            )}
            {isSettled && request.amount != null && (
              <div className="col-span-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                  <span className="text-gray-500">구입금액:</span>
                  <span className="font-semibold text-gray-800">{request.amount.toLocaleString()}원</span>
                </div>
              </div>
            )}

            {/* 배송비 */}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">
                배송비 (원) {!isSettled && <span className="text-gray-400 font-normal">선택</span>}
              </label>
              <input type="number" value={shippingFee} onChange={e => setShippingFee(e.target.value)}
                disabled={isSettled} placeholder="0" className={inputCls} />
            </div>

            {/* 합계 */}
            {!isSettled && (calcAmount > 0 || shippingFee) && (
              <div className="col-span-2 flex justify-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
                  <span className="text-gray-500">합계: </span>
                  <span className="font-bold text-blue-700">
                    {(calcAmount + (parseInt(shippingFee || '0') || 0)).toLocaleString()}원
                  </span>
                  {calcAmount > 0 && shippingFee && (
                    <span className="text-gray-400 text-xs ml-2">
                      (구입 {calcAmount.toLocaleString()} + 배송 {parseInt(shippingFee).toLocaleString()})
                    </span>
                  )}
                </div>
              </div>
            )}
            {isSettled && request.amount != null && request.shipping_fee != null && (
              <div className="col-span-2 flex justify-end">
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
                  <span className="text-gray-500">합계: </span>
                  <span className="font-bold text-blue-700">
                    {(request.amount + request.shipping_fee).toLocaleString()}원
                  </span>
                </div>
              </div>
            )}

            {/* 메모 */}
            <div className="col-span-2">
              <label className="text-xs text-gray-600 font-medium mb-1 block">메모</label>
              <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
                disabled={isSettled} placeholder="자유 입력" className={inputCls} />
            </div>
          </div>

          {/* ── 사진 섹션 ── */}
          {showPhotoSection && (
            <div className="space-y-4 pt-3 border-t border-gray-200">

              {isSettled ? (
                /* 정산완료: 읽기 전용 사진만 */
                <>
                  {deliveryItems.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">① 납품완료 사진</p>
                      <ReadOnlyPhotoGrid urls={deliveryItems.map(i => i.url)} />
                    </div>
                  )}
                  {receiptPhotos.filter(rp => rp.url).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">② 영수증 사진</p>
                      <div className="flex flex-wrap gap-3">
                        {receiptPhotos.filter(rp => rp.url).map((rp, i) => (
                          <div key={i} className="flex flex-col items-center gap-1">
                            <a href={rp.url} target="_blank" rel="noreferrer">
                              <img src={rp.url} alt={rp.label} className="w-16 h-16 object-cover rounded-lg border" />
                            </a>
                            <span className="text-xs text-gray-500 text-center max-w-[64px] leading-tight">{rp.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {deliveryReceiptItems.length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-2">③ 배송비 영수증 사진</p>
                      <ReadOnlyPhotoGrid urls={deliveryReceiptItems.map(i => i.url)} />
                    </div>
                  )}
                </>
              ) : (
                /* 주문완료: 드롭존 포함 전체 업로드 UI */
                <>
                  {/* ① 납품완료 사진 */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">① 납품완료 사진</p>
                    <div {...getDeliveryRootProps()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${isDeliveryDrag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
                      <input {...getDeliveryInputProps()} />
                      <p className="text-sm text-gray-500">{isDeliveryDrag ? '여기에 놓으세요' : '클릭하거나 사진을 드래그하여 업로드'}</p>
                    </div>
                    {deliveryItems.length > 0 && (
                      <div className="grid grid-cols-6 gap-1 mt-2">
                        {deliveryItems.map((item, i) => (
                          <div key={i} className="relative aspect-square rounded border overflow-hidden group">
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setDeliveryItems(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500" title="사진 삭제">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ② 영수증 사진 */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">② 영수증 사진</p>
                    <div className="space-y-2">
                      {receiptPhotos.map((rp, i) => (
                        <ReceiptDropzoneCard key={i} index={i} label={rp.label} url={rp.url}
                          onLabelChange={label => setReceiptPhotos(prev => { const u = [...prev]; u[i] = { ...u[i], label }; return u })}
                          onFileDrop={(file, url) => setReceiptPhotos(prev => { const u = [...prev]; u[i] = { ...u[i], file, url }; return u })}
                          onRemove={() => setReceiptPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          onRemovePhoto={() => setReceiptPhotos(prev => { const u = [...prev]; u[i] = { label: u[i].label }; return u })}
                        />
                      ))}
                      <button type="button" onClick={() => setReceiptPhotos(prev => [...prev, { label: `영수증 ${prev.length + 1}` }])}
                        className="text-xs text-blue-600 hover:underline mt-1">+ 영수증 추가</button>
                    </div>
                  </div>

                  {/* ③ 배송비 영수증 사진 */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">③ 배송비 영수증 사진</p>
                    <div {...getDeliveryReceiptRootProps()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${isDeliveryReceiptDrag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
                      <input {...getDeliveryReceiptInputProps()} />
                      <p className="text-sm text-gray-500">{isDeliveryReceiptDrag ? '여기에 놓으세요' : '클릭하거나 사진을 드래그하여 업로드'}</p>
                    </div>
                    {deliveryReceiptItems.length > 0 && (
                      <div className="grid grid-cols-6 gap-1 mt-2">
                        {deliveryReceiptItems.map((item, i) => (
                          <div key={i} className="relative aspect-square rounded border overflow-hidden group">
                            <img src={item.url} alt="" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setDeliveryReceiptItems(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-500" title="사진 삭제">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 구글시트 연동 결과 ── */}
      {sheetResult && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-2 ${
          sheetResult === 'matched' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          <span>{sheetResult === 'matched' ? '✓' : '!'}</span>
          <span>{sheetResult === 'matched' ? '관리대장 자동 입력됨' : '관리대장 미매칭 — 입고대기 시트 확인 필요'}</span>
        </div>
      )}

      {/* ── 정산완료 엑셀 다운로드 ── */}
      {isSettled && (
        <div className="flex gap-2 mb-4 flex-wrap">
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

      {/* ── 버튼 영역 ── */}
      {request.status !== 'rejected' && (
        <div className="flex gap-2 flex-wrap items-center">
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
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-700">반려 처리됨</p>
          {request.reject_reason && <p className="text-sm text-red-600 mt-1">사유: {request.reject_reason}</p>}
        </div>
      )}
    </div>
  )
}
