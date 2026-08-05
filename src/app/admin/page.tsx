'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminHeader from '@/components/AdminHeader'
import RequestDetailPanel from '@/components/RequestDetailPanel'
import ConsumptionDetailPanel from '@/components/ConsumptionDetailPanel'
import type { Request, Status, ConsumptionRecord } from '@/types'
import { STATUS_LABEL, STATUS_COLOR, URGENCY_LABEL, URGENCY_COLOR, CONSUMPTION_STATUS_LABEL, CONSUMPTION_STATUS_COLOR } from '@/types'

// 3개월 이전 정산완료 항목 중 사진이 남아있는 건 반환
function getOldPhotoItems(requests: Request[]): Request[] {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)
  cutoff.setDate(1)
  cutoff.setHours(0, 0, 0, 0)
  return requests.filter(r => {
    if (r.status !== 'settled' || !r.receipt_number) return false
    if (!(r.delivery_photo_urls?.length) && !(r.receipt_photo_urls?.length)) return false
    const parts = r.receipt_number.split('-')
    if (parts.length < 2) return false
    const yy = parseInt(parts[0], 10), mm = parseInt(parts[1], 10)
    return new Date(2000 + yy, mm - 1, 1) < cutoff
  })
}

// Blob을 파일로 다운로드
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [requests, setRequests] = useState<Request[]>([])
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkExcelLoading, setBulkExcelLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  // 연도·월 필터
  const [yearFilter, setYearFilter] = useState(() => String(new Date().getFullYear()).slice(2))
  const [monthFilter, setMonthFilter] = useState(() => String(new Date().getMonth() + 1))
  const [availableYears, setAvailableYears] = useState<string[]>(() => [String(new Date().getFullYear()).slice(2)])

  // 검색
  const [searchQuery, setSearchQuery] = useState('')

  // 월별 정산
  const [monthInput, setMonthInput] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthlyData, setMonthlyData] = useState<Request[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [excelLoading, setExcelLoading] = useState(false)

  // 설정
  const [categories, setCategories] = useState<any[]>([])
  const [vendorList, setVendorList] = useState<any[]>([])
  const [newVendorName, setNewVendorName] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatCode, setNewCatCode] = useState('')
  const [handoverMemo, setHandoverMemo] = useState('')
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState('')

  // 일괄 삭제 모달
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // 구매월 이관 모달
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferYear, setTransferYear] = useState(() => String(new Date().getFullYear()))
  const [transferMonth, setTransferMonth] = useState(() => {
    const next = new Date(); next.setMonth(next.getMonth() + 1)
    return String(next.getMonth() + 1)
  })
  const [transferLoading, setTransferLoading] = useState(false)

  // 토스트
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const showToast = (msg: string) => {
    setToastMsg(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 4000)
  }

  // 소모내역
  const [consumptionRecords, setConsumptionRecords] = useState<ConsumptionRecord[]>([])
  const [consumptionLoading, setConsumptionLoading] = useState(false)
  const [expandedConsumptionId, setExpandedConsumptionId] = useState<string | null>(null)
  const [consYearFilter, setConsYearFilter] = useState(() => String(new Date().getFullYear()).slice(2))
  const [consMonthFilter, setConsMonthFilter] = useState(() => String(new Date().getMonth() + 1))
  const [consStatusFilter, setConsStatusFilter] = useState<string>('all')
  const [consAvailableYears, setConsAvailableYears] = useState<string[]>(() => [String(new Date().getFullYear()).slice(2)])

  // 사진 정리
  const [photoDownloading, setPhotoDownloading] = useState(false)
  const [photoDownloadDone, setPhotoDownloadDone] = useState(false)
  const [photoDeleting, setPhotoDeleting] = useState(false)
  const [showPhotoDeleteModal, setShowPhotoDeleteModal] = useState(false)

  // 세션 체크 — 미로그인 시 로그인 페이지로 이동
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/admin/login')
      } else {
        setAuthChecked(true)
      }
    })
  }, [router])

  // 연도 목록: 전체 접수번호에서 YY 추출 (상태 필터와 무관하게 1회 fetch)
  useEffect(() => {
    if (!authChecked) return
    fetch('/api/admin/requests')
      .then(r => r.json())
      .then(({ data }) => {
        const yearSet = new Set<string>()
        const currentYY = String(new Date().getFullYear()).slice(2)
        yearSet.add(currentYY)
        ;(data || []).forEach((r: any) => {
          // purchase_month 기준 연도 우선 (이관된 건 포함)
          if (r.purchase_month) {
            const yy = r.purchase_month.slice(2, 4)
            if (/^\d{2}$/.test(yy)) yearSet.add(yy)
          }
          const yy = r.receipt_number?.split('-')[0]
          if (yy && /^\d{2}$/.test(yy)) yearSet.add(yy)
        })
        setAvailableYears(Array.from(yearSet).sort())
      })
      .catch(() => {})
  }, [authChecked])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [reqRes, vendorRes] = await Promise.all([
      fetch('/api/admin/requests'),   // 항상 전체 fetch — 상태·연월 필터는 클라이언트에서 처리
      fetch('/api/vendors'),
    ])
    const [reqData, vendorData] = await Promise.all([reqRes.json(), vendorRes.json()])
    setRequests(reqData.data || [])
    setVendors(vendorData.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fetchConsumption = useCallback(async () => {
    setConsumptionLoading(true)
    const res = await fetch('/api/consumption')
    const data = await res.json()
    const records: ConsumptionRecord[] = data.data || []
    setConsumptionRecords(records)

    const yearSet = new Set<string>()
    yearSet.add(String(new Date().getFullYear()).slice(2))
    records.forEach(r => {
      const yy = r.used_date?.slice(2, 4)
      if (yy && /^\d{2}$/.test(yy)) yearSet.add(yy)
    })
    setConsAvailableYears(Array.from(yearSet).sort())
    setConsumptionLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'consumption') fetchConsumption()
  }, [activeTab, fetchConsumption])

  const handleConsumptionUpdate = (updated: ConsumptionRecord) => {
    setConsumptionRecords(prev => prev.map(r => r.id === updated.id ? updated : r))
    setExpandedConsumptionId(null)
  }

  const handleConsumptionDelete = (id: string) => {
    setConsumptionRecords(prev => prev.filter(r => r.id !== id))
    setExpandedConsumptionId(null)
  }

  useEffect(() => {
    if (activeTab === 'settings') {
      Promise.all([
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/vendors').then(r => r.json()),
        fetch('/api/settings').then(r => r.json()),
      ]).then(([catData, vendData, setData]) => {
        setCategories(catData.data || [])
        setVendorList(vendData.data || [])
        setHandoverMemo(setData.data?.handover_memo || '')
      })
    }
  }, [activeTab])

  const handleBulkStatus = async (status: Status) => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    await fetch('/api/admin/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedIds, status }),
    })
    setSelectedIds([])
    await fetchAll()
    setBulkLoading(false)
  }

  const handleTransfer = async () => {
    const target = `${transferYear}-${transferMonth.padStart(2, '0')}`
    const eligible = selectedIds.filter(id => {
      const r = requests.find(r => r.id === id)
      return r && r.status !== 'settled'
    })
    const skipped = selectedIds.length - eligible.length
    if (eligible.length === 0) {
      alert('이관 가능한 건이 없습니다.\n정산완료 상태는 이관할 수 없습니다.')
      return
    }
    setTransferLoading(true)
    await fetch('/api/admin/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: eligible, purchase_month: target }),
    })
    await fetchAll()
    setTransferLoading(false)
    setTransferOpen(false)
    const label = `${transferYear}년 ${parseInt(transferMonth)}월`
    showToast(skipped > 0
      ? `${eligible.length}건이 ${label}로 이관되었습니다. (${skipped}건 건너뜀)`
      : `${eligible.length}건이 ${label}로 이관되었습니다.`)
  }

  const handleBulkDelete = async () => {
    const blocked = selectedIds.filter(id => {
      const r = requests.find(r => r.id === id)
      return r && r.status === 'settled'
    })
    if (blocked.length > 0) {
      const eligible = selectedIds.filter(id => {
        const r = requests.find(r => r.id === id)
        return r && r.status !== 'settled'
      })
      if (eligible.length === 0) {
        alert(`정산완료 건은 삭제할 수 없습니다.\n선택된 ${blocked.length}건 모두 정산완료 상태입니다.`)
        setDeleteOpen(false)
        return
      }
      // 일부만 삭제 가능한 경우 계속 진행 (토스트에서 안내)
    }
    const eligible = selectedIds.filter(id => {
      const r = requests.find(r => r.id === id)
      return r && r.status !== 'settled'
    })
    const skipped = selectedIds.length - eligible.length
    setDeleteLoading(true)
    const res = await fetch('/api/admin/requests', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: eligible }),
    })
    const data = await res.json()
    setDeleteLoading(false)
    setDeleteOpen(false)
    if (!res.ok) { alert('삭제 오류: ' + data.error); return }
    setSelectedIds([])
    await fetchAll()
    showToast(skipped > 0
      ? `${eligible.length}건이 삭제되었습니다. (완료 처리 ${skipped}건 제외)`
      : `${eligible.length}건이 삭제되었습니다.`)
  }

  const handleBulkExcel = async () => {
    if (selectedIds.length === 0) return
    setBulkExcelLoading(true)
    try {
      const res = await fetch('/api/excel/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) throw new Error((await res.json()).error || '엑셀 생성 실패')
      const now = new Date()
      const yyMM = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`
      downloadBlob(await res.blob(), `${yyMM}_${selectedIds.length}건_정산내역.xlsx`)
    } catch (err: any) {
      alert('오류: ' + err.message)
    } finally {
      setBulkExcelLoading(false)
    }
  }

  const handleRequestUpdate = (updated: Request) => {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setExpandedId(null)
    fetchAll()
  }

  const handleMonthlyExcel = async () => {
    setExcelLoading(true)
    try {
      const res = await fetch(`/api/excel/monthly?month=${monthInput}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `서버 오류 (${res.status})`)
      }
      const [y, m] = monthInput.split('-')
      downloadBlob(await res.blob(), `${y.slice(2)}${m}_정산현황.xlsx`)
    } catch (err: any) { alert('엑셀 생성 오류: ' + err.message) }
    setExcelLoading(false)
  }

  const handleAllExcel = async () => {
    try {
      const res = await fetch('/api/excel/all')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `서버 오류 (${res.status})`)
      }
      downloadBlob(await res.blob(), `전체이력_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (err: any) { alert('엑셀 생성 오류: ' + err.message) }
  }

  const handleMonthSearch = async () => {
    setMonthlyLoading(true)
    const res = await fetch(`/api/admin/requests?status=all`)
    const data = await res.json()
    // purchase_month 기준 (없으면 created_at 월로 fallback) — 이관된 건 포함
    const filtered = (data.data || []).filter((r: Request) => {
      const ym = r.purchase_month || r.created_at.slice(0, 7)
      return ym === monthInput
    })
    setMonthlyData(filtered)
    setMonthlyLoading(false)
  }

  const handleSaveMemo = async () => {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'handover_memo', value: handoverMemo }),
    })
    alert('저장되었습니다.')
  }

  const handleAddVendor = async () => {
    if (!newVendorName.trim()) return
    await fetch('/api/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newVendorName }),
    })
    setNewVendorName('')
    const res = await fetch('/api/vendors')
    const data = await res.json()
    setVendorList(data.data || [])
  }

  const handleDeleteVendor = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/vendors?id=${id}`, { method: 'DELETE' })
    setVendorList(prev => prev.filter(v => v.id !== id))
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim() || !newCatCode.trim()) return
    await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName, code: newCatCode }),
    })
    setNewCatName(''); setNewCatCode('')
    const res = await fetch('/api/categories')
    const data = await res.json()
    setCategories(data.data || [])
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  const handleChangePw = async () => {
    if (pwForm.next !== pwForm.confirm) { setPwMsg('새 비밀번호가 일치하지 않습니다.'); return }
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) { setPwMsg('변경 실패: ' + error.message); return }
    setPwMsg('비밀번호가 변경되었습니다.')
    setPwForm({ current: '', next: '', confirm: '' })
  }

  // 사진 정리 핸들러
  const handlePhotoDownload = async () => {
    setPhotoDownloading(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const cutoff = new Date()
      cutoff.setMonth(cutoff.getMonth() - 3)
      cutoff.setDate(1)
      const items = getOldPhotoItems(requests)

      for (const req of items) {
        const folder = zip.folder(req.receipt_number!)!
        for (let i = 0; i < (req.delivery_photo_urls ?? []).length; i++) {
          try {
            const url = req.delivery_photo_urls![i]
            const blob = await fetch(url).then(r => r.blob())
            const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
            folder.file(`납품사진_${i + 1}.${ext}`, blob)
          } catch { /* 개별 실패 건 skip */ }
        }
        for (let i = 0; i < (req.receipt_photo_urls ?? []).length; i++) {
          try {
            const photo = req.receipt_photo_urls![i]
            const url = photo.url
            const blob = await fetch(url).then(r => r.blob())
            const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
            folder.file(`영수증_${photo.label || i + 1}.${ext}`, blob)
          } catch { /* 개별 실패 건 skip */ }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const cutoffYY = String(cutoff.getFullYear()).slice(2)
      const cutoffMM = String(cutoff.getMonth() + 1).padStart(2, '0')
      const today = new Date()
      const todayStr = `${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
      downloadBlob(content, `사진아카이브_${cutoffYY}${cutoffMM}이전_${todayStr}.zip`)
      setPhotoDownloadDone(true)
    } catch (err: any) {
      alert('다운로드 오류: ' + err.message)
    } finally {
      setPhotoDownloading(false)
    }
  }

  const handlePhotoDelete = async () => {
    setShowPhotoDeleteModal(false)
    setPhotoDeleting(true)
    try {
      const ids = getOldPhotoItems(requests).map(r => r.id)

      const res = await fetch('/api/admin/photos/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      alert(`삭제 완료 (파일 ${data.deleted}개)`)
      setPhotoDownloadDone(false)
      await fetchAll()
    } catch (err: any) {
      alert('삭제 오류: ' + err.message)
    } finally {
      setPhotoDeleting(false)
    }
  }

  // 카테고리별 금액 집계
  const catSummary = monthlyData.reduce((acc: Record<string, { count: number; amount: number }>, r) => {
    if (!acc[r.category]) acc[r.category] = { count: 0, amount: 0 }
    acc[r.category].count++
    acc[r.category].amount += r.amount || 0
    return acc
  }, {})

  // 연도·월 필터 (상태 무관) — purchase_month 기준 (없으면 receipt_number fallback)
  const yearMonthFiltered = requests.filter(req => {
    let refYY: string, refMM: string
    if (req.purchase_month) {
      refYY = req.purchase_month.slice(2, 4)                        // "2026-06" → "26"
      refMM = String(parseInt(req.purchase_month.slice(5, 7)))      // "06" → "6"
    } else {
      const parts = req.receipt_number?.split('-') ?? []
      if (parts.length < 2) return false
      refYY = parts[0]
      refMM = String(parseInt(parts[1]))
    }
    if (refYY !== yearFilter) return false
    if (monthFilter !== 'all' && refMM !== monthFilter) return false
    return true
  })

  // 상태 + 검색어 필터 — 테이블 표시용
  const q = searchQuery.trim().toLowerCase()
  const filteredRequests = yearMonthFiltered.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (q) {
      const hit = [r.receipt_number, r.item_name, r.spec, r.requester_name, r.vendor, r.memo]
        .some(field => field?.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  // 카드 통계 — 선택 연월 기준
  const settledItems = yearMonthFiltered.filter(r => r.status === 'settled')
  const dynamicStats = {
    new:              yearMonthFiltered.filter(r => r.status === 'new').length,
    reviewing:        yearMonthFiltered.filter(r => r.status === 'reviewing').length,
    ordered:          yearMonthFiltered.filter(r => r.status === 'ordered').length,
    settled_purchase: settledItems.reduce((s, r) => s + (r.amount       || 0), 0),
    settled_shipping: settledItems.reduce((s, r) => s + (r.shipping_fee || 0), 0),
    settled_total:    settledItems.reduce((s, r) => s + (r.amount || 0) + (r.shipping_fee || 0), 0),
  }

  // 카드 상단 기준 텍스트
  const filterLabel = monthFilter === 'all'
    ? `20${yearFilter}년 전체 기준`
    : `20${yearFilter}년 ${monthFilter}월 기준`

  const allChecked = filteredRequests.length > 0 && filteredRequests.every(r => selectedIds.includes(r.id))

  // 소모내역 — 연도·월·상태 필터 (used_date 기준)
  const consFilteredRecords = consumptionRecords.filter(r => {
    const yy = r.used_date?.slice(2, 4)
    const mm = r.used_date ? String(parseInt(r.used_date.slice(5, 7))) : ''
    if (yy !== consYearFilter) return false
    if (consMonthFilter !== 'all' && mm !== consMonthFilter) return false
    if (consStatusFilter !== 'all' && r.status !== consStatusFilter) return false
    return true
  })

  // 세션 확인 전 빈 화면 (깜빡임 방지)
  if (!authChecked) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ─── 요청 목록 탭 ─── */}
      {activeTab === 'dashboard' && (
        <div className="max-w-7xl mx-auto px-4 pb-6">

          {/* ══ 고정 영역 (sticky) ══ */}
          <div className="sticky top-0 z-20 bg-gray-100 -mx-4 px-4 pt-6 pb-3 shadow-[0_4px_6px_-2px_rgba(0,0,0,0.06)]">

            {/* 대시보드 카드 */}
            <div className="mb-3">
              <p className="text-xs text-gray-400 text-right mb-1.5">{filterLabel}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: '신규 요청', value: dynamicStats.new,                                       color: 'bg-green-50  border-green-200  text-green-700',  leftColor: '#2E9E5B' },
                  { label: '처리 중',   value: dynamicStats.reviewing + dynamicStats.ordered, color: 'bg-orange-50 border-orange-200 text-orange-700', leftColor: '#C97A1E' },
                  { label: '주문완료', value: dynamicStats.ordered,                                   color: 'bg-purple-50 border-purple-200 text-purple-700',  leftColor: '#7c3aed' },
                  { label: '구매금액',  value: dynamicStats.settled_purchase.toLocaleString() + '원',  color: 'bg-purple-50 border-purple-200 text-purple-700', leftColor: null },
                  { label: '배송비',    value: dynamicStats.settled_shipping.toLocaleString() + '원',  color: 'bg-pink-50   border-pink-200   text-pink-700',   leftColor: null },
                  { label: '합계',      value: dynamicStats.settled_total.toLocaleString()    + '원',  color: '', leftColor: null, isTotal: true },
                ].map((card, i) => (
                  card.isTotal ? (
                    <div key={i} className="rounded-xl p-4" style={{
                      background: 'linear-gradient(180deg, #0d77bd, #0A67A6)',
                      boxShadow: '0 2px 6px rgba(10,103,166,0.25)',
                      border: 'none',
                    }}>
                      <p className="text-xs font-medium text-white/80 mb-1">{card.label}</p>
                      <p className="text-xl font-bold text-white">{card.value}</p>
                    </div>
                  ) : (
                    <div key={i} className={`bg-white border rounded-xl p-4 ${card.color}`} style={{
                      borderLeft: card.leftColor ? `3px solid ${card.leftColor}` : undefined,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}>
                      <p className="text-xs font-medium opacity-70 mb-1">{card.label}</p>
                      <p className="text-xl font-bold">{card.value}</p>
                    </div>
                  )
                ))}
              </div>
            </div>

          {/* 필터 바 */}
          <div className="flex gap-2 mb-0 flex-wrap items-center">
            {/* 연도 드롭다운 */}
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="px-2 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map(yy => (
                <option key={yy} value={yy}>{`20${yy}`}년</option>
              ))}
            </select>

            {/* 월 드롭다운 */}
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="px-2 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 월</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={String(m)}>{m}월</option>
              ))}
            </select>

            {/* 구분선 */}
            <div className="w-px h-5 bg-gray-300" />

            {/* 검색창 */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="접수번호·물품명·규격·요청자·구입처·메모"
                className="pl-8 pr-7 py-1.5 text-sm border rounded-lg bg-white text-gray-700 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base leading-none"
                >
                  ×
                </button>
              )}
            </div>

            {/* 구분선 */}
            <div className="w-px h-5 bg-gray-300" />

            {/* 상태 필터 */}
            {['all', 'new', 'reviewing', 'ordered', 'settled', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === s ? 'bg-[#0A67A6] text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                {s === 'all' ? '전체' : STATUS_LABEL[s as Status]}
              </button>
            ))}

            <button onClick={fetchAll} className="ml-auto px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">🔄 새로고침</button>
          </div>

          {/* 일괄 처리 바 */}
          {selectedIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-[#0A67A6]">{selectedIds.length}건 선택됨</span>
              {(['reviewing', 'ordered', 'settled'] as Status[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleBulkStatus(s)}
                  disabled={bulkLoading}
                  className="px-3 py-1.5 bg-[#0A67A6] text-white rounded-lg text-sm hover:brightness-90 transition disabled:opacity-60"
                >
                  {STATUS_LABEL[s]}으로 변경
                </button>
              ))}
              <button
                onClick={() => {
                  const next = new Date(); next.setMonth(next.getMonth() + 1)
                  setTransferYear(String(next.getFullYear()))
                  setTransferMonth(String(next.getMonth() + 1))
                  setTransferOpen(true)
                }}
                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:brightness-90 transition"
              >
                📅 구매월 이관
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="px-3 py-1.5 text-white rounded-lg text-sm font-semibold hover:brightness-90 transition"
                style={{ backgroundColor: '#DC2626' }}
              >
                🗑 삭제
              </button>
              <button
                onClick={handleBulkExcel}
                disabled={bulkExcelLoading}
                className="px-3 py-1.5 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90 transition disabled:opacity-60 ml-auto"
              >
                {bulkExcelLoading ? '생성 중...' : `📥 선택 항목 엑셀 다운로드`}
              </button>
            </div>
          )}

          </div>{/* ── /sticky 고정 영역 ── */}

          {/* 요청 목록 + 이용방법 사이드바 */}
          <div className="flex gap-3 mt-3 items-start">
          <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '0.5px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            {loading ? (
              <div className="py-16 text-center text-gray-400">불러오는 중...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                {searchQuery ? `"${searchQuery}" 검색 결과 없음` : '요청 없음'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={e => setSelectedIds(e.target.checked ? filteredRequests.map(r => r.id) : [])}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">접수번호</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">카테고리</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold max-w-[160px]">물품명</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden xl:table-cell">단가</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden xl:table-cell">수량</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden lg:table-cell">구입금액</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden lg:table-cell">배송료</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden sm:table-cell">요청자</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden lg:table-cell" style={{ minWidth: '64px' }}>긴급도</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold" style={{ minWidth: '84px' }}>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map(req => (
                    <>
                      <tr
                        key={req.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition ${
                          req.urgency === 'urgent' ? 'bg-red-50' : ''
                        } ${expandedId === req.id ? 'bg-blue-50' : ''}`}
                        onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                      >
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(req.id)}
                            onChange={e => setSelectedIds(prev =>
                              e.target.checked ? [...prev, req.id] : prev.filter(id => id !== req.id)
                            )}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs text-gray-600">{req.receipt_number}</span>
                          {req.purchase_link && (
                            <a href={req.purchase_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="ml-1 text-blue-400 hover:text-blue-600">🔗</a>
                          )}
                          {req.request_photos && req.request_photos.length > 0 && (
                            <span className="ml-1 text-gray-400">📷</span>
                          )}
                          {(() => {
                            const receiptYM = req.receipt_number
                              ? `20${req.receipt_number.split('-')[0]}-${req.receipt_number.split('-')[1]}`
                              : null
                            if (req.purchase_month && receiptYM && req.purchase_month !== receiptYM) {
                              const m = parseInt(req.purchase_month.split('-')[1])
                              return (
                                <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                                  →{m}월 이관
                                </span>
                              )
                            }
                            return null
                          })()}
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell text-gray-600">{req.category}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium">{req.item_name}</span>
                          {req.spec && <span className="text-gray-400 text-xs ml-1">({req.spec})</span>}
                        </td>
                        <td className="px-3 py-3 text-right hidden xl:table-cell text-gray-700 text-xs tabular-nums">
                          {req.unit_price != null ? req.unit_price.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-3 text-right hidden xl:table-cell text-gray-700 text-xs tabular-nums">
                          {req.purchase_quantity ?? req.quantity}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell text-gray-700 text-xs tabular-nums">
                          {req.amount != null ? req.amount.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-3 text-right hidden lg:table-cell text-gray-700 text-xs tabular-nums">
                          {req.shipping_fee != null ? req.shipping_fee.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell text-gray-600">{req.requester_name}</td>
                        <td className="px-3 py-3 hidden lg:table-cell" style={{ minWidth: '64px' }}>
                          <span className={`rounded-full text-xs font-medium ${URGENCY_COLOR[req.urgency]}`}
                            style={{ padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {URGENCY_LABEL[req.urgency]}
                          </span>
                        </td>
                        <td className="px-3 py-3" style={{ minWidth: '84px' }}>
                          <span className={`rounded-full text-xs font-semibold ${STATUS_COLOR[req.status]}`}
                            style={{ padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {STATUS_LABEL[req.status]}
                          </span>
                        </td>
                      </tr>
                      {expandedId === req.id && (
                        <tr key={`${req.id}-detail`}>
                          <td colSpan={11} className="p-0">
                            <RequestDetailPanel
                              request={req}
                              vendors={vendors}
                              onUpdate={handleRequestUpdate}
                              onClose={() => setExpandedId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>{/* /flex-1 */}

          {/* 이용방법 사이드바 */}
          <div className="hidden lg:flex flex-col w-52 shrink-0 rounded-xl overflow-hidden sticky top-[calc(var(--sticky-h,180px)+12px)]" style={{
            background: '#FFFBE0',
            borderLeft: '0.5px solid #EDE900',
            boxShadow: 'inset 3px 0 6px -4px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div className="px-4 pt-4 pb-5 space-y-3">
              <p className="text-sm font-bold" style={{ color: '#5C5300' }}>이용방법</p>
              <ol className="space-y-2.5">
                {[
                  '신규요청 확인 후 검토 진행',
                  '상태 변경 (체크박스로 일괄 변경 가능)',
                  '구입정보 입력 (단가·수량 → 자동계산)',
                  '증빙 사진(납품·영수증) 업로드',
                  '정산완료 처리 → 관리대장 자동 반영',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#5C5300' }}>
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold leading-none mt-0.5" style={{
                      background: 'linear-gradient(180deg, #0d77bd, #0A67A6)',
                    }}>{i + 1}</span>
                    <span className="leading-snug opacity-85">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] leading-snug pt-1 border-t" style={{ color: '#8a7400', borderColor: '#EDE900' }}>
                월별정산 엑셀은 새로고침 옆 메뉴에서
              </p>
            </div>
          </div>
          </div>{/* /flex gap-3 */}

        </div>
      )}

      {/* ─── 월별 정산 탭 ─── */}
      {activeTab === 'monthly' && (
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">월별 정산 현황</h2>
            <div className="flex gap-3 mb-6">
              <input
                type="month"
                value={monthInput}
                onChange={e => setMonthInput(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleMonthSearch}
                disabled={monthlyLoading}
                className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60"
              >
                {monthlyLoading ? '조회 중...' : '조회'}
              </button>
              <button
                onClick={handleMonthlyExcel}
                disabled={excelLoading}
                className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60"
              >
                {excelLoading ? '생성 중...' : '📥 엑셀 내보내기'}
              </button>
            </div>

            {/* 카테고리별 집계 */}
            {Object.keys(catSummary).length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-600 mb-2">카테고리별 집계</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">카테고리</th>
                        <th className="px-4 py-2 text-right">건수</th>
                        <th className="px-4 py-2 text-right">금액</th>
                        <th className="px-4 py-2 text-right">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(catSummary).map(([cat, val]) => {
                        const total = Object.values(catSummary).reduce((s, v) => s + v.amount, 0)
                        return (
                          <tr key={cat} className="border-t">
                            <td className="px-4 py-2">{cat}</td>
                            <td className="px-4 py-2 text-right">{val.count}건</td>
                            <td className="px-4 py-2 text-right">{val.amount.toLocaleString()}원</td>
                            <td className="px-4 py-2 text-right">{total > 0 ? Math.round(val.amount / total * 1000) / 10 : 0}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 상세 목록 */}
            {monthlyData.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {['접수번호', '카테고리', '물품명', '단가', '수량', '배송비', '구입금액', '상태'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-600 font-semibold text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(r => (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{r.receipt_number}</td>
                        <td className="px-3 py-2 text-xs">{r.category}</td>
                        <td className="px-3 py-2">{r.item_name}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">
                          {r.unit_price != null ? r.unit_price.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">
                          {(r.purchase_quantity ?? r.quantity) != null ? (r.purchase_quantity ?? r.quantity) : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">
                          {r.shipping_fee != null ? r.shipping_fee.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold">
                          {r.amount != null ? r.amount.toLocaleString() : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {monthlyData.length === 0 && !monthlyLoading && (
              <p className="text-center text-gray-400 py-8">조회 버튼을 눌러 데이터를 불러오세요.</p>
            )}
          </div>
        </div>
      )}

      {/* ─── 소모내역 탭 ─── */}
      {activeTab === 'consumption' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-4">소모내역</h2>

              {/* 필터 바 */}
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  value={consYearFilter}
                  onChange={e => setConsYearFilter(e.target.value)}
                  className="px-2 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {consAvailableYears.map(yy => (
                    <option key={yy} value={yy}>{`20${yy}`}년</option>
                  ))}
                </select>
                <select
                  value={consMonthFilter}
                  onChange={e => setConsMonthFilter(e.target.value)}
                  className="px-2 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">전체 월</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={String(m)}>{m}월</option>
                  ))}
                </select>

                <div className="w-px h-5 bg-gray-300" />

                {(['all', 'pending', 'confirmed'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setConsStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      consStatusFilter === s ? 'bg-[#0A67A6] text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                    }`}
                  >
                    {s === 'all' ? '전체' : CONSUMPTION_STATUS_LABEL[s]}
                  </button>
                ))}

                <button onClick={fetchConsumption} className="ml-auto px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">🔄 새로고침</button>
              </div>
            </div>

            {consumptionLoading ? (
              <div className="py-16 text-center text-gray-400">불러오는 중...</div>
            ) : consFilteredRecords.length === 0 ? (
              <div className="py-16 text-center text-gray-400">소모내역이 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-t border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">이름</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">물품명</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden sm:table-cell">규격</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold">수량</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">사용일</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">사용처</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold" style={{ minWidth: '84px' }}>상태</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden lg:table-cell">등록일</th>
                  </tr>
                </thead>
                <tbody>
                  {consFilteredRecords.map(rec => (
                    <>
                      <tr
                        key={rec.id}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition ${
                          expandedConsumptionId === rec.id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => setExpandedConsumptionId(expandedConsumptionId === rec.id ? null : rec.id)}
                      >
                        <td className="px-3 py-3 text-gray-600">{rec.input_by}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium">{rec.item_name}</span>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell text-gray-500 text-xs">{rec.spec || '-'}</td>
                        <td className="px-3 py-3 text-right text-gray-700 text-xs tabular-nums">{rec.quantity}</td>
                        <td className="px-3 py-3 text-xs">{rec.used_date}</td>
                        <td className="px-3 py-3 hidden md:table-cell text-gray-600 text-xs">{rec.used_location || '-'}</td>
                        <td className="px-3 py-3" style={{ minWidth: '84px' }}>
                          <span className={`rounded-full text-xs font-semibold ${CONSUMPTION_STATUS_COLOR[rec.status]}`}
                            style={{ padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {CONSUMPTION_STATUS_LABEL[rec.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell text-gray-500 text-xs">{rec.created_at.slice(0, 10)}</td>
                      </tr>
                      {expandedConsumptionId === rec.id && (
                        <tr key={`${rec.id}-detail`}>
                          <td colSpan={8} className="p-0">
                            <ConsumptionDetailPanel
                              record={rec}
                              onUpdate={handleConsumptionUpdate}
                              onDelete={handleConsumptionDelete}
                              onClose={() => setExpandedConsumptionId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── 설정 탭 ─── */}
      {activeTab === 'settings' && (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* 비밀번호 변경 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4">🔐 관리자 비밀번호 변경</h2>
            <div className="space-y-3">
              <input type="password" placeholder="새 비밀번호" value={pwForm.next}
                onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <input type="password" placeholder="새 비밀번호 확인" value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
              <button onClick={handleChangePw} className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90">변경</button>
              {pwMsg && <p className="text-sm text-blue-600">{pwMsg}</p>}
            </div>
          </div>

          {/* 카테고리 관리 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4">📂 물품 카테고리 관리</h2>
            <div className="space-y-2 mb-4">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="text-sm">{cat.name} <span className="text-gray-400 text-xs">({cat.code})</span></span>
                  <button onClick={() => handleDeleteCategory(cat.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="카테고리명" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <input value={newCatCode} onChange={e => setNewCatCode(e.target.value)} placeholder="코드" className="w-24 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={handleAddCategory} className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90">추가</button>
            </div>
          </div>

          {/* 거래처 관리 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4">🏪 거래처 목록 관리</h2>
            <div className="space-y-2 mb-4">
              {vendorList.map(v => (
                <div key={v.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                  <span className="text-sm">{v.name}</span>
                  <button onClick={() => handleDeleteVendor(v.id)} className="text-red-400 hover:text-red-600 text-xs">삭제</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="거래처명" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
              <button onClick={handleAddVendor} className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90">추가</button>
            </div>
          </div>

          {/* 인수인계 메모 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-4">📝 인수인계 메모</h2>
            <textarea
              value={handoverMemo}
              onChange={e => setHandoverMemo(e.target.value)}
              rows={6}
              placeholder="인수인계 시 전달할 내용을 자유롭게 작성하세요"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleSaveMemo} className="mt-3 px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90">저장</button>
          </div>

          {/* 오래된 사진 정리 */}
          {(() => {
            const cutoff = new Date()
            cutoff.setMonth(cutoff.getMonth() - 3)
            cutoff.setDate(1)
            const cutoffYY = String(cutoff.getFullYear()).slice(2)
            const cutoffMM = String(cutoff.getMonth() + 1).padStart(2, '0')
            const items = getOldPhotoItems(requests)
            const photoCount = items.reduce(
              (s, r) => s + (r.delivery_photo_urls?.length ?? 0) + (r.receipt_photo_urls?.length ?? 0), 0
            )
            const estMB = Math.round(photoCount * 0.5)
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-base font-bold text-gray-800 mb-1">🗂️ 오래된 사진 정리</h2>
                <p className="text-sm text-gray-500 mb-4">
                  3개월 이전({cutoffYY}{cutoffMM} 이전) 정산완료 항목의 납품·영수증 사진을 일괄 보관 후 삭제합니다.
                </p>

                {items.length === 0 ? (
                  <p className="text-sm text-gray-400">정리 대상 항목이 없습니다.</p>
                ) : (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
                      <span className="text-sm font-semibold text-amber-800">대상 {items.length}건</span>
                      <span className="text-sm text-amber-600 ml-2">· 사진 {photoCount}장 · 약 {estMB}MB</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handlePhotoDownload}
                        disabled={photoDownloading}
                        className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90 disabled:opacity-60"
                      >
                        {photoDownloading ? '다운로드 중...' : '📥 사진 다운로드 (zip)'}
                      </button>

                      <button
                        onClick={() => setShowPhotoDeleteModal(true)}
                        disabled={!photoDownloadDone || photoDeleting}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition"
                      >
                        {photoDeleting ? '삭제 중...' : 'Supabase에서 삭제'}
                      </button>

                      {photoDownloadDone && !photoDeleting && (
                        <span className="text-xs text-green-600 font-medium">✓ 다운로드 완료 — 삭제 버튼 활성화됨</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })()}

          {/* 전체 이력 내보내기 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-2">📤 전체 요청 이력 내보내기</h2>
            <p className="text-sm text-gray-500 mb-4">전체 요청 이력을 엑셀 파일로 다운로드합니다.</p>
            <button onClick={handleAllExcel} className="px-4 py-2 bg-[#0A67A6] text-white rounded-lg text-sm font-semibold hover:brightness-90">
              📥 전체 이력 엑셀 다운로드
            </button>
          </div>
        </div>
      )}
      {/* 구매월 이관 모달 */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTransferOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-800 mb-1">구매월 이관</h3>
            <p className="text-xs text-gray-500 mb-4">
              선택된 {selectedIds.length}건의 구매예정월을 변경합니다.<br />
              <span className="text-amber-600 font-medium">정산완료 상태는 자동으로 건너뜁니다.</span>
            </p>
            <div className="flex gap-2 mb-5">
              <select
                value={transferYear}
                onChange={e => setTransferYear(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {[...Array(3)].map((_, i) => {
                  const y = String(new Date().getFullYear() + i - 1)
                  return <option key={y} value={y}>{y}년</option>
                })}
              </select>
              <select
                value={transferMonth}
                onChange={e => setTransferMonth(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={String(m)}>{m}월</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTransferOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
              >취소</button>
              <button
                onClick={handleTransfer}
                disabled={transferLoading}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:brightness-90 transition disabled:opacity-60"
              >{transferLoading ? '이관 중...' : '이관 확인'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 삭제 확인 모달 */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-red-700 mb-2">⚠️ 삭제 확인</h3>
            <p className="text-sm text-gray-700 mb-1">
              선택한 <span className="font-bold">{selectedIds.length}건</span>을 삭제하시겠습니까?
            </p>
            <p className="text-xs text-gray-400 mb-1">삭제 후 복구할 수 없습니다.</p>
            <p className="text-xs text-amber-600 mb-5">정산완료 상태는 자동으로 제외됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
              >취소</button>
              <button
                onClick={handleBulkDelete}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 text-white rounded-lg text-sm font-semibold hover:brightness-90 transition disabled:opacity-60"
                style={{ backgroundColor: '#DC2626' }}
              >{deleteLoading ? '삭제 중...' : '삭제 확인'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-800 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">
            {toastMsg}
          </div>
        </div>
      )}

      {/* 사진 삭제 확인 모달 */}
      {showPhotoDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-900 mb-2">⚠️ 사진 삭제 확인</h3>
            <p className="text-sm text-gray-600 mb-1">정말 삭제하시겠습니까?</p>
            <p className="text-sm font-semibold text-red-600 mb-5">
              다운로드한 zip 파일을 반드시 보관하세요.<br />
              삭제된 사진은 복구할 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPhotoDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handlePhotoDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700"
              >
                삭제 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
