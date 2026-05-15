'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import type { Request, ReceiptPhoto } from '@/types'
import { STATUS_LABEL, STATUS_FLOW, NEXT_STATUS_LABEL } from '@/types'

interface Props {
  request: Request
  vendors: { id: string; name: string }[]
  onUpdate: (updated: Request) => void
  onClose: () => void
}

export default function RequestDetailPanel({ request, vendors, onUpdate, onClose }: Props) {
  const [vendor, setVendor] = useState(request.vendor || '')
  const [vendorInput, setVendorInput] = useState(request.vendor || '')
  const [amount, setAmount] = useState(request.amount?.toString() || '')
  const [purchaseDate, setPurchaseDate] = useState(request.purchase_date || '')
  const [memo, setMemo] = useState(request.memo || '')
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [loading, setLoading] = useState(false)

  // 정산 처리용 사진
  const [deliveryPhotos, setDeliveryPhotos] = useState<File[]>([])
  const [deliveryPreviews, setDeliveryPreviews] = useState<string[]>(request.delivery_photo_urls || [])
  const [receiptPhotos, setReceiptPhotos] = useState<Array<{ label: string; file?: File; url?: string }>>(
    request.receipt_photo_urls
      ? (request.receipt_photo_urls as ReceiptPhoto[]).map(r => ({ label: r.label, url: r.url }))
      : [{ label: '물건 영수증' }, { label: '배송료 영수증' }]
  )

  const [excelLoading, setExcelLoading] = useState<'delivery' | 'receipt' | null>(null)

  const isSettling = request.status === 'purchased'

  // 납품 사진 드랍존
  const onDropDelivery = useCallback((acceptedFiles: File[]) => {
    setDeliveryPhotos(prev => [...prev, ...acceptedFiles])
    const previews = acceptedFiles.map(f => URL.createObjectURL(f))
    setDeliveryPreviews(prev => [...prev, ...previews])
  }, [])

  const { getRootProps: getDeliveryRootProps, getInputProps: getDeliveryInputProps, isDragActive: isDeliveryDrag } = useDropzone({
    onDrop: onDropDelivery,
    accept: { 'image/*': [] },
    multiple: true,
  })

  const uploadFiles = async (files: File[], bucket: string): Promise<string[]> => {
    const urls: string[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bucket', bucket)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.url) urls.push(data.url)
    }
    return urls
  }

  const handleNextStatus = async () => {
    const nextStatus = STATUS_FLOW[request.status]
    if (!nextStatus) return
    setLoading(true)
    try {
      let deliveryUrls = request.delivery_photo_urls || []
      let receiptUrls = request.receipt_photo_urls || []

      if (nextStatus === 'settled') {
        // 새 납품 사진 업로드
        if (deliveryPhotos.length > 0) {
          const newUrls = await uploadFiles(deliveryPhotos, 'delivery-photos')
          deliveryUrls = [...(request.delivery_photo_urls?.filter(u => !u.startsWith('blob:')) || []), ...newUrls]
        }
        // 영수증 사진 업로드
        const newReceiptUrls: ReceiptPhoto[] = []
        for (const r of receiptPhotos) {
          if (r.url && !r.file) {
            newReceiptUrls.push({ label: r.label, url: r.url })
          } else if (r.file) {
            const fd = new FormData()
            fd.append('file', r.file)
            fd.append('bucket', 'receipt-photos')
            const res = await fetch('/api/upload', { method: 'POST', body: fd })
            const data = await res.json()
            if (data.url) newReceiptUrls.push({ label: r.label, url: data.url })
          }
        }
        receiptUrls = newReceiptUrls as any
      }

      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [request.id],
          status: nextStatus,
          vendor: vendorInput || null,
          amount: amount ? parseInt(amount) : null,
          purchase_date: purchaseDate || null,
          memo: memo || null,
          delivery_photo_urls: nextStatus === 'settled' ? deliveryUrls : undefined,
          receipt_photo_urls: nextStatus === 'settled' ? receiptUrls : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdate(data.data[0])
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { alert('반려 사유를 입력해주세요.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [request.id], status: 'rejected', reject_reason: rejectReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onUpdate(data.data[0])
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleExcel = async (type: 'delivery' | 'receipt') => {
    setExcelLoading(type)
    try {
      const body = {
        receipt_number: request.receipt_number,
        item_name: request.item_name,
        delivery_photo_urls: type === 'delivery' ? (request.delivery_photo_urls || []) : undefined,
        receipt_photo_urls: type === 'receipt' ? (request.receipt_photo_urls || []) : undefined,
      }
      const endpoint = type === 'delivery' ? '/api/excel/delivery' : '/api/excel/receipt'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('엑셀 생성 실패')
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
        <div><span className="text-gray-500">접수일</span><br /><strong>{request.created_at.slice(0,10)}</strong></div>
        <div><span className="text-gray-500">물품명</span><br /><strong>{request.item_name}</strong></div>
        <div><span className="text-gray-500">수량</span><br /><strong>{request.quantity} {request.unit}</strong></div>
        {request.spec && <div className="col-span-2"><span className="text-gray-500">규격</span><br /><strong>{request.spec}</strong></div>}
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

      {/* 상태 흐름 표시 */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto">
        {(['new', 'reviewing', 'purchased', 'settled'] as const).map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-shrink-0">
            <span className={`px-2 py-1 rounded text-xs font-semibold ${
              request.status === s ? 'bg-blue-600 text-white' :
              (['new', 'reviewing', 'purchased', 'settled'].indexOf(request.status) > i ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400')
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
              <label className="text-xs text-gray-600 font-medium mb-1 block">구입 금액 (원)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
            <div className="space-y-4 pt-2 border-t border-gray-200">
              {/* 납품완료 사진 */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">① 납품완료 사진</p>
                <div
                  {...getDeliveryRootProps()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                    isDeliveryDrag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  <input {...getDeliveryInputProps()} />
                  <p className="text-sm text-gray-500">여기에 사진을 드래그하거나 클릭하여 업로드</p>
                </div>
                {/* 슬롯 표시 */}
                <div className="grid grid-cols-6 gap-1 mt-2">
                  {Array.from({ length: Math.max(6, deliveryPreviews.length) }).map((_, i) => (
                    <div key={i} className={`aspect-square rounded border ${deliveryPreviews[i] ? '' : 'border-dashed border-gray-200'}`}>
                      {deliveryPreviews[i] ? (
                        <img src={deliveryPreviews[i]} alt="" className="w-full h-full object-cover rounded" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-200 text-xs">✕</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 영수증 사진 */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">② 영수증 사진</p>
                <div className="space-y-2">
                  {receiptPhotos.map((rp, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-3">
                      <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                      <input
                        type="text"
                        value={rp.label}
                        onChange={e => {
                          const updated = [...receiptPhotos]
                          updated[i] = { ...updated[i], label: e.target.value }
                          setReceiptPhotos(updated)
                        }}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-32"
                      />
                      {rp.url ? (
                        <a href={rp.url} target="_blank" rel="noreferrer">
                          <img src={rp.url} alt="" className="w-12 h-12 object-cover rounded border" />
                        </a>
                      ) : (
                        <label className="cursor-pointer text-xs text-blue-600 underline">
                          사진 선택
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const updated = [...receiptPhotos]
                              updated[i] = { ...updated[i], file, url: URL.createObjectURL(file) }
                              setReceiptPhotos(updated)
                            }}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setReceiptPhotos(prev => [...prev, { label: `영수증 ${prev.length + 1}` }])}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    + 영수증 추가
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 이미 정산완료인 경우 엑셀 다운로드 */}
      {request.status === 'settled' && (
        <div className="flex gap-2 mb-4">
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
        <div className="flex gap-2 flex-wrap">
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
          {request.reject_reason && <p className="text-sm text-red-600 mt-1">사유: {request.reject_reason}</p>}
        </div>
      )}
    </div>
  )
}
