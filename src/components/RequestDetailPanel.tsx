'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import type { Request, ReceiptPhoto } from '@/types'
import { STATUS_LABEL, STATUS_FLOW, NEXT_STATUS_LABEL } from '@/types'
import { uploadToStorage, uploadManyToStorage } from '@/lib/uploadToStorage'

interface Props {
  request: Request
  vendors: { id: string; name: string }[]
  onUpdate: (updated: Request) => void
  onClose: () => void
}

// ─── 헬퍼: 응답이 JSON이 아닐 때도 안전하게 파싱 ───
async function safeJson(res: Response): Promise<{ ok: boolean; data: any }> {
  const text = await res.text()
  try {
    return { ok: res.ok, data: JSON.parse(text) }
  } catch {
    // HTML 오류 페이지 등 non-JSON 응답 처리
    const snippet = text.slice(0, 120).replace(/<[^>]+>/g, '').trim()
    return {
      ok: false,
      data: { error: `서버 오류 (${res.status})${snippet ? ': ' + snippet : ''}` },
    }
  }
}

// ─── 영수증 카드 1장당 드롭존 컴포넌트 (훅은 컴포넌트 안에서만 호출 가능) ───
interface ReceiptCardProps {
  index: number
  label: string
  url?: string
  onLabelChange: (label: string) => void
  onFileDrop: (file: File, previewUrl: string) => void
  onRemove: () => void
}

function ReceiptDropzoneCard({ index, label, url, onLabelChange, onFileDrop, onRemove }: ReceiptCardProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return
    onFileDrop(file, URL.createObjectURL(file))
  }, [onFileDrop])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    noClick: !!url, // 사진이 있을 때는 클릭으로 재선택 방지 (썸네일 클릭용 별도 버튼 제공)
  })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      {/* 상단: 번호 + 종류명 + 삭제 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-medium w-5 shrink-0">{index + 1}</span>
        <input
          type="text"
          value={label}
          onChange={e => onLabelChange(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-300 hover:text-red-400 text-base leading-none"
          title="삭제"
        >
          ×
        </button>
      </div>

      {/* 드롭존 영역 */}
      <div
        {...getRootProps()}
        className={`relative rounded-lg border-2 border-dashed transition cursor-pointer ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : url
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
        style={{ minHeight: '96px' }}
      >
        <input {...getInputProps()} />

        {url ? (
          /* 사진 미리보기 */
          <div className="flex items-center gap-3 p-2">
            <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
              <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border" />
            </a>
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-500">사진이 선택되었습니다.</p>
              {/* 재선택 버튼 — 별도 label로 파일 인풋 트리거 */}
              <label className="cursor-pointer text-xs text-blue-600 hover:underline">
                다시 선택
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    onFileDrop(file, URL.createObjectURL(file))
                  }}
                />
              </label>
              <p className="text-xs text-gray-400">또는 사진을 드래그</p>
            </div>
          </div>
        ) : (
          /* 빈 슬롯 */
          <div className="flex flex-col items-center justify-center h-full py-4 gap-1">
            <span className="text-2xl text-gray-300">📄</span>
            <p className="text-xs text-gray-400">
              {isDragActive ? '여기에 놓으세요' : '클릭하거나 사진을 드래그'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 메인 패널 ───
export default function RequestDetailPanel({ request, vendors, onUpdate, onClose }: Props) {
  const [vendorInput, setVendorInput] = useState(request.vendor || '')
  const [unitPrice, setUnitPrice] = useState(request.unit_price?.toString() || '')
  const [purchaseQty, setPurchaseQty] = useState(request.quantity?.toString() || '1')
  const [shippingFee, setShippingFee] = useState(request.shipping_fee?.toString() || '')

  // 단가 × 수량 = 구입금액 자동 계산
  const calcAmount = (parseInt(unitPrice || '0') || 0) * (parseInt(purchaseQty || '0') || 0)
  const amount = calcAmount > 0 ? calcAmount.toString() : (request.amount?.toString() || '')
  const [purchaseDate, setPurchaseDate] = useState(request.purchase_date || '')
  const [memo, setMemo] = useState(request.memo || '')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState(false)

  // 납품완료 사진
  const [deliveryPhotos, setDeliveryPhotos] = useState<File[]>([])
  const [deliveryPreviews, setDeliveryPreviews] = useState<string[]>(
    request.delivery_photo_urls || []
  )

  // 영수증 사진
  const [receiptPhotos, setReceiptPhotos] = useState<Array<{ label: string; file?: File; url?: string }>>(
    request.receipt_photo_urls && (request.receipt_photo_urls as ReceiptPhoto[]).length > 0
      ? (request.receipt_photo_urls as ReceiptPhoto[]).map(r => ({ label: r.label, url: r.url }))
      : [{ label: '물건 영수증' }, { label: '배송료 영수증' }]
  )

  const [excelLoading, setExcelLoading] = useState<'delivery' | 'receipt' | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  const isSettling = request.status === 'purchased'

  // 납품 사진 드롭존
  const onDropDelivery = useCallback((acceptedFiles: File[]) => {
    setDeliveryPhotos(prev => [...prev, ...acceptedFiles])
    setDeliveryPreviews(prev => [...prev, ...acceptedFiles.map(f => URL.createObjectURL(f))])
  }, [])

  const { getRootProps: getDeliveryRootProps, getInputProps: getDeliveryInputProps, isDragActive: isDeliveryDrag } = useDropzone({
    onDrop: onDropDelivery,
    accept: { 'image/*': [] },
    multiple: true,
  })

  // 저장 (상태 변경 없이 입력값만 DB 저장)
  const handleSave = async () => {
    setSaveStatus('saving')
    setSaveError('')
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [request.id],
          vendor: vendorInput || null,
          unit_price: unitPrice ? parseInt(unitPrice) : null,
          quantity: purchaseQty ? parseInt(purchaseQty) : null,
          amount: calcAmount > 0 ? calcAmount : (request.amount ?? null),
          shipping_fee: shippingFee ? parseInt(shippingFee) : null,
          purchase_date: purchaseDate || null,
          memo: memo || null,
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '저장 실패')
      onUpdate(data.data[0])
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch (err: any) {
      setSaveError(err.message)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }

  // 다음 단계로 변경
  const handleNextStatus = async () => {
    const nextStatus = STATUS_FLOW[request.status]
    if (!nextStatus) return
    setLoading(true)
    try {
      let deliveryUrls = request.delivery_photo_urls || []
      let receiptUrls: ReceiptPhoto[] = (request.receipt_photo_urls as ReceiptPhoto[]) || []

      if (nextStatus === 'settled') {
        // 납품 사진: 브라우저 → Supabase Storage 직접 업로드
        if (deliveryPhotos.length > 0) {
          const newUrls = await uploadManyToStorage(deliveryPhotos, 'delivery-photos')
          deliveryUrls = [...(request.delivery_photo_urls || []), ...newUrls]
        }

        // 영수증 사진: 파일이 있는 항목만 직접 업로드, 기존 URL은 그대로 유지
        const newReceiptUrls: ReceiptPhoto[] = []
        for (const rp of receiptPhotos) {
          if (rp.file) {
            const url = await uploadToStorage(rp.file, 'receipt-photos')
            newReceiptUrls.push({ label: rp.label, url })
          } else if (rp.url) {
            newReceiptUrls.push({ label: rp.label, url: rp.url })
          }
        }
        receiptUrls = newReceiptUrls
      }

      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [request.id],
          status: nextStatus,
          vendor: vendorInput || null,
          unit_price: unitPrice ? parseInt(unitPrice) : null,
          amount: calcAmount > 0 ? calcAmount : (amount ? parseInt(amount) : null),
          shipping_fee: shippingFee ? parseInt(shippingFee) : null,
          purchase_date: purchaseDate || null,
          memo: memo || null,
          ...(nextStatus === 'settled' && {
            delivery_photo_urls: deliveryUrls,
            receipt_photo_urls: receiptUrls,
          }),
        }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '상태 변경 실패')
      onUpdate(data.data[0])
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 반려 처리
  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('반려 사유를 입력해주세요.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [request.id], status: 'rejected', reject_reason: rejectReason }),
      })
      const { ok, data } = await safeJson(res)
      if (!ok) throw new Error(data.error || '반려 처리 실패')
      onUpdate(data.data[0])
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // 엑셀 다운로드
  const handleExcel = async (type: 'delivery' | 'receipt') => {
    setExcelLoading(type)
    try {
      const endpoint = type === 'delivery' ? '/api/excel/delivery' : '/api/excel/receipt'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_number: request.receipt_number,
          item_name: request.item_name,
          delivery_photo_urls: type === 'delivery' ? (request.delivery_photo_urls || []) : undefined,
          receipt_photo_urls: type === 'receipt' ? (request.receipt_photo_urls || []) : undefined,
        }),
      })
      if (!res.ok) {
        const { data } = await safeJson(res)
        throw new Error(data.error || '엑셀 생성 실패')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${request.receipt_number}_${type === 'delivery' ? '납품완료사진' : '영수증사진'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setExcelLoading(null)
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-1 mx-2 mb-2">

      {/* 기본 정보 요약 */}
      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div><span className="text-gray-500">요청자</span><br /><strong>{request.requester_name}</strong></div>
        <div><span className="text-gray-500">접수일</span><br /><strong>{request.created_at.slice(0, 10)}</strong></div>
        <div><span className="text-gray-500">물품명</span><br /><strong>{request.item_name}</strong></div>
        <div><span className="text-gray-500">수량</span><br /><strong>{request.quantity} {request.unit}</strong></div>
        {request.spec && (
          <div className="col-span-2"><span className="text-gray-500">규격</span><br /><strong>{request.spec}</strong></div>
        )}
        <div className="col-span-2"><span className="text-gray-500">용도/사유</span><br /><strong>{request.purpose}</strong></div>

        {/* 구입 금액 정보 — 구입완료·정산완료 상태에서만 표시 */}
        {(request.status === 'purchased' || request.status === 'settled') && (
          <div className="col-span-2">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">구입금액</p>
                <p className="font-semibold text-gray-800">
                  {request.amount != null ? request.amount.toLocaleString() + '원' : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">배송비</p>
                <p className="font-semibold text-gray-800">
                  {request.shipping_fee != null ? request.shipping_fee.toLocaleString() + '원' : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">합계</p>
                <p className="font-bold text-blue-700">
                  {((request.amount || 0) + (request.shipping_fee || 0)).toLocaleString()}원
                </p>
              </div>
            </div>
          </div>
        )}

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

      {/* 상태 흐름 */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        {(['new', 'reviewing', 'purchased', 'settled'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-semibold ${
              request.status === s
                ? 'bg-blue-600 text-white'
                : ['new', 'reviewing', 'purchased', 'settled'].indexOf(request.status) > i
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-400'
            }`}>{STATUS_LABEL[s]}</span>
            {i < 3 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {/* 구입 정보 입력 */}
      {request.status !== 'settled' && request.status !== 'rejected' && (
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">구입처</label>
              <input
                list="vendor-list"
                value={vendorInput}
                onChange={e => setVendorInput(e.target.value)}
                placeholder="구입처 입력 또는 선택"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="vendor-list">
                {vendors.map(v => <option key={v.id} value={v.name} />)}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">단가 (원)</label>
              <input
                type="number"
                value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">수량</label>
              <input
                type="number"
                value={purchaseQty}
                onChange={e => setPurchaseQty(e.target.value)}
                min="1"
                placeholder="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* 구입금액 자동 계산 표시 */}
            {calcAmount > 0 && (
              <div className="col-span-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                  <span className="text-gray-500">구입금액:</span>
                  <span className="font-semibold text-gray-800">{calcAmount.toLocaleString()}원</span>
                  <span className="text-gray-400 text-xs">
                    ({parseInt(unitPrice || '0').toLocaleString()} × {parseInt(purchaseQty || '0')})
                  </span>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">
                배송비 (원) <span className="text-gray-400 font-normal">선택</span>
              </label>
              <input
                type="number"
                value={shippingFee}
                onChange={e => setShippingFee(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* 합계 표시 */}
            {(calcAmount > 0 || shippingFee) && (
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
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">구입 날짜</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 font-medium mb-1 block">메모</label>
              <input
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="자유 입력"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 정산완료 처리 시 사진 업로드 */}
          {isSettling && (
            <div className="space-y-4 pt-3 border-t border-gray-200">

              {/* ① 납품완료 사진 */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">① 납품완료 사진</p>
                <div
                  {...getDeliveryRootProps()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                    isDeliveryDrag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  <input {...getDeliveryInputProps()} />
                  <p className="text-sm text-gray-500">
                    {isDeliveryDrag ? '여기에 놓으세요' : '클릭하거나 사진을 드래그하여 업로드'}
                  </p>
                </div>
                {/* 슬롯 그리드 */}
                {deliveryPreviews.length > 0 && (
                  <div className="grid grid-cols-6 gap-1 mt-2">
                    {Array.from({ length: Math.max(6, deliveryPreviews.length) }).map((_, i) => (
                      <div
                        key={i}
                        className={`aspect-square rounded border overflow-hidden ${
                          deliveryPreviews[i] ? '' : 'border-dashed border-gray-200'
                        }`}
                      >
                        {deliveryPreviews[i] ? (
                          <img src={deliveryPreviews[i]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-200 text-xs">—</div>
                        )}
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
                    <ReceiptDropzoneCard
                      key={i}
                      index={i}
                      label={rp.label}
                      url={rp.url}
                      onLabelChange={label => {
                        setReceiptPhotos(prev => {
                          const updated = [...prev]
                          updated[i] = { ...updated[i], label }
                          return updated
                        })
                      }}
                      onFileDrop={(file, previewUrl) => {
                        setReceiptPhotos(prev => {
                          const updated = [...prev]
                          updated[i] = { ...updated[i], file, url: previewUrl }
                          return updated
                        })
                      }}
                      onRemove={() => {
                        setReceiptPhotos(prev => prev.filter((_, idx) => idx !== i))
                      }}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setReceiptPhotos(prev => [...prev, { label: `영수증 ${prev.length + 1}` }])
                    }
                    className="text-xs text-blue-600 hover:underline mt-1"
                  >
                    + 영수증 추가
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 정산완료 상태 — 엑셀 다운로드 */}
      {request.status === 'settled' && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {request.delivery_photo_urls && request.delivery_photo_urls.length > 0 && (
            <button
              onClick={() => handleExcel('delivery')}
              disabled={excelLoading === 'delivery'}
              className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition disabled:opacity-60"
            >
              {excelLoading === 'delivery' ? '생성 중...' : '📥 납품사진 엑셀'}
            </button>
          )}
          {request.receipt_photo_urls && (request.receipt_photo_urls as ReceiptPhoto[]).length > 0 && (
            <button
              onClick={() => handleExcel('receipt')}
              disabled={excelLoading === 'receipt'}
              className="px-3 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 transition disabled:opacity-60"
            >
              {excelLoading === 'receipt' ? '생성 중...' : '📥 영수증 엑셀'}
            </button>
          )}
        </div>
      )}

      {/* 버튼 영역 */}
      {request.status !== 'settled' && request.status !== 'rejected' && (
        <div className="flex gap-2 flex-wrap items-center">
          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || loading}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-300 transition disabled:opacity-60"
          >
            {saveStatus === 'saving' ? '저장 중...' : '저장'}
          </button>
          {saveStatus === 'saved' && (
            <span className="text-sm text-green-600 font-medium">저장됨 ✓</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-red-500">{saveError || '저장 실패'}</span>
          )}

          {STATUS_FLOW[request.status] && (
            <button
              onClick={handleNextStatus}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-60"
            >
              {loading ? '처리 중...' : NEXT_STATUS_LABEL[request.status]}
            </button>
          )}

          {!showReject ? (
            <button
              onClick={() => setShowReject(true)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-200 transition"
            >
              반려
            </button>
          ) : (
            <div className="w-full space-y-2">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="반려 사유를 입력하세요"
                rows={2}
                className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
                >
                  {loading ? '처리 중...' : '반려 확정'}
                </button>
                <button
                  onClick={() => setShowReject(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            닫기
          </button>
        </div>
      )}

      {request.status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-700">반려 처리됨</p>
          {request.reject_reason && (
            <p className="text-sm text-red-600 mt-1">사유: {request.reject_reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
