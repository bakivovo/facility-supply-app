'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AdminHeader from '@/components/AdminHeader'
import RequestDetailPanel from '@/components/RequestDetailPanel'
import type { Request, Status } from '@/types'
import { STATUS_LABEL, STATUS_COLOR, URGENCY_LABEL, URGENCY_COLOR } from '@/types'

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

  const handleBulkExcel = async () => {
    if (selectedIds.length === 0) return
    setBulkExcelLoading(true)
    try {
      const res = await fetch('/api/excel/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '엑셀 생성 실패')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const now = new Date()
      const yyMM = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`
      a.download = `${yyMM}_${selectedIds.length}건_정산내역.xlsx`
      a.click()
      URL.revokeObjectURL(url)
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
      if (!res.ok) throw new Error('엑셀 생성 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const [y, m] = monthInput.split('-')
      a.download = `${y.slice(2)}${m}_정산현황.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) { alert(err.message) }
    setExcelLoading(false)
  }

  const handleAllExcel = async () => {
    const res = await fetch('/api/excel/all')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `전체이력_${new Date().toISOString().slice(0,10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleMonthSearch = async () => {
    setMonthlyLoading(true)
    const res = await fetch(`/api/admin/requests?status=all`)
    const data = await res.json()
    const filtered = (data.data || []).filter((r: Request) => r.created_at.startsWith(monthInput))
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

  // 카테고리별 금액 집계
  const catSummary = monthlyData.reduce((acc: Record<string, { count: number; amount: number }>, r) => {
    if (!acc[r.category]) acc[r.category] = { count: 0, amount: 0 }
    acc[r.category].count++
    acc[r.category].amount += r.amount || 0
    return acc
  }, {})

  // 연도·월 필터 (상태 무관) — 카드 통계 기준
  const yearMonthFiltered = requests.filter(req => {
    const parts = req.receipt_number?.split('-') ?? []
    if (parts.length < 2) return false
    if (parts[0] !== yearFilter) return false
    if (monthFilter !== 'all' && parseInt(parts[1]) !== parseInt(monthFilter)) return false
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
    purchased:        yearMonthFiltered.filter(r => r.status === 'purchased').length,
    settled_purchase: settledItems.reduce((s, r) => s + (r.amount       || 0), 0),
    settled_shipping: settledItems.reduce((s, r) => s + (r.shipping_fee || 0), 0),
    settled_total:    settledItems.reduce((s, r) => s + (r.amount || 0) + (r.shipping_fee || 0), 0),
  }

  // 카드 상단 기준 텍스트
  const filterLabel = monthFilter === 'all'
    ? `20${yearFilter}년 전체 기준`
    : `20${yearFilter}년 ${monthFilter}월 기준`

  const allChecked = filteredRequests.length > 0 && filteredRequests.every(r => selectedIds.includes(r.id))

  // 세션 확인 전 빈 화면 (깜빡임 방지)
  if (!authChecked) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <AdminHeader activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ─── 요청 목록 탭 ─── */}
      {activeTab === 'dashboard' && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* 대시보드 카드 */}
          <div className="mb-6">
            <p className="text-xs text-gray-400 text-right mb-1.5">{filterLabel}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: '신규 요청',  value: dynamicStats.new,                                        color: 'bg-green-50  border-green-200  text-green-700'  },
                { label: '처리 중',    value: dynamicStats.reviewing + dynamicStats.purchased,          color: 'bg-orange-50 border-orange-200 text-orange-700' },
                { label: '구입 완료',  value: dynamicStats.purchased,                                  color: 'bg-blue-50   border-blue-200   text-blue-700'   },
                { label: '구매금액',   value: dynamicStats.settled_purchase.toLocaleString() + '원',   color: 'bg-purple-50 border-purple-200 text-purple-700' },
                { label: '배송비',     value: dynamicStats.settled_shipping.toLocaleString() + '원',   color: 'bg-pink-50   border-pink-200   text-pink-700'   },
                { label: '합계',       value: dynamicStats.settled_total.toLocaleString()    + '원',   color: 'bg-gray-50   border-gray-200   text-gray-700'   },
              ].map((card, i) => (
                <div key={i} className={`bg-white border rounded-xl p-4 ${card.color}`}>
                  <p className="text-xs font-medium opacity-70 mb-1">{card.label}</p>
                  <p className="text-xl font-bold">{card.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 필터 바 */}
          <div className="flex gap-2 mb-3 flex-wrap items-center">
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
            {['all', 'new', 'reviewing', 'purchased', 'settled', 'rejected'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                {s === 'all' ? '전체' : STATUS_LABEL[s as Status]}
              </button>
            ))}

            <button onClick={fetchAll} className="ml-auto px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">🔄 새로고침</button>
          </div>

          {/* 일괄 처리 바 */}
          {selectedIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-blue-700">{selectedIds.length}건 선택됨</span>
              {(['reviewing', 'purchased', 'settled'] as Status[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleBulkStatus(s)}
                  disabled={bulkLoading}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {STATUS_LABEL[s]}으로 변경
                </button>
              ))}
              <button
                onClick={handleBulkExcel}
                disabled={bulkExcelLoading}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition disabled:opacity-60 ml-auto"
              >
                {bulkExcelLoading ? '생성 중...' : `📥 선택 항목 엑셀 다운로드`}
              </button>
            </div>
          )}

          {/* 요청 목록 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">물품명</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden xl:table-cell">단가</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden xl:table-cell">수량</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden lg:table-cell">구입금액</th>
                    <th className="px-3 py-3 text-right text-gray-600 font-semibold hidden lg:table-cell">배송료</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden sm:table-cell">요청자</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold hidden lg:table-cell">긴급도</th>
                    <th className="px-3 py-3 text-left text-gray-600 font-semibold">상태</th>
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
                        <td className="px-3 py-3 hidden lg:table-cell">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLOR[req.urgency]}`}>
                            {URGENCY_LABEL[req.urgency]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[req.status]}`}>
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
              >
                {monthlyLoading ? '조회 중...' : '조회'}
              </button>
              <button
                onClick={handleMonthlyExcel}
                disabled={excelLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-60"
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
                      {['접수번호', '접수일', '카테고리', '물품명', '요청자', '구입처', '금액', '상태'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-gray-600 font-semibold text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map(r => (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{r.receipt_number}</td>
                        <td className="px-3 py-2 text-xs">{r.created_at.slice(0,10)}</td>
                        <td className="px-3 py-2 text-xs">{r.category}</td>
                        <td className="px-3 py-2">{r.item_name}</td>
                        <td className="px-3 py-2 text-xs">{r.requester_name}</td>
                        <td className="px-3 py-2 text-xs">{r.vendor || '-'}</td>
                        <td className="px-3 py-2 text-xs">{r.amount ? r.amount.toLocaleString() + '원' : '-'}</td>
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
              <button onClick={handleChangePw} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">변경</button>
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
              <button onClick={handleAddCategory} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">추가</button>
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
              <button onClick={handleAddVendor} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">추가</button>
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
            <button onClick={handleSaveMemo} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">저장</button>
          </div>

          {/* 전체 이력 내보내기 */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-800 mb-2">📤 전체 요청 이력 내보내기</h2>
            <p className="text-sm text-gray-500 mb-4">전체 요청 이력을 엑셀 파일로 다운로드합니다.</p>
            <button onClick={handleAllExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
              📥 전체 이력 엑셀 다운로드
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
