'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import InventoryHeader from '@/components/InventoryHeader'
import type { ConsumptionRecord, InventoryItem } from '@/types'
import { CONSUMPTION_STATUS_LABEL, CONSUMPTION_STATUS_COLOR } from '@/types'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type AccessState = 'checking' | 'denied' | 'granted'

export default function InventoryPage() {
  const router = useRouter()
  const [accessState, setAccessState] = useState<AccessState>('checking')
  const [userEmail, setUserEmail] = useState('')
  const [activeTab, setActiveTab] = useState('stock')

  // 재고 현황
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)

  // 소모내역 입력
  const [consForm, setConsForm] = useState({
    item_name: '',
    spec: '',
    quantity: 1,
    used_date: todayStr(),
    used_location: '',
    note: '',
  })
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const autocompleteTimer = useRef<NodeJS.Timeout | undefined>(undefined)

  // 소모내역 열람
  const [viewRecords, setViewRecords] = useState<ConsumptionRecord[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewYearFilter, setViewYearFilter] = useState(() => String(new Date().getFullYear()).slice(2))
  const [viewMonthFilter, setViewMonthFilter] = useState(() => String(new Date().getMonth() + 1))
  const [viewStatusFilter, setViewStatusFilter] = useState('all')
  const [viewAvailableYears, setViewAvailableYears] = useState<string[]>(() => [String(new Date().getFullYear()).slice(2)])

  // ── 로그인 + 권한 체크 ──
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/inventory/login')
        return
      }
      setUserEmail(user.email || '')
      const role = (user.user_metadata as any)?.role
      setAccessState(role === 'inventory_manager' ? 'granted' : 'denied')
    })
  }, [router])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/inventory/login')
  }

  // ── 재고 현황 fetch ──
  const fetchInventory = useCallback(async () => {
    setInventoryLoading(true)
    const res = await fetch('/api/inventory')
    const data = await res.json()
    setInventoryItems(data.data || [])
    setInventoryLoading(false)
  }, [])

  useEffect(() => {
    if (accessState === 'granted' && activeTab === 'stock') fetchInventory()
  }, [accessState, activeTab, fetchInventory])

  // ── 소모내역 열람 fetch ──
  const fetchViewRecords = useCallback(async () => {
    setViewLoading(true)
    const res = await fetch('/api/consumption')
    const data = await res.json()
    const records: ConsumptionRecord[] = data.data || []
    setViewRecords(records)

    const yearSet = new Set<string>()
    yearSet.add(String(new Date().getFullYear()).slice(2))
    records.forEach(r => {
      const yy = r.used_date?.slice(2, 4)
      if (yy && /^\d{2}$/.test(yy)) yearSet.add(yy)
    })
    setViewAvailableYears(Array.from(yearSet).sort())
    setViewLoading(false)
  }, [])

  useEffect(() => {
    if (accessState === 'granted' && activeTab === 'view') fetchViewRecords()
  }, [accessState, activeTab, fetchViewRecords])

  // ── 소모내역 입력 ──
  const handleItemNameChange = (val: string) => {
    setConsForm(prev => ({ ...prev, item_name: val }))
    clearTimeout(autocompleteTimer.current)
    if (val.length < 1) { setAutocompleteItems([]); setShowAutocomplete(false); return }
    autocompleteTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/requests?autocomplete=${encodeURIComponent(val)}`)
      const data = await res.json()
      setAutocompleteItems(data.items || [])
      setShowAutocomplete(true)
    }, 250)
  }

  const handleConsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (!consForm.item_name || !consForm.quantity || !consForm.used_date) {
      setSubmitError('필수 항목을 모두 입력해주세요.')
      return
    }
    if (consForm.quantity < 1) {
      setSubmitError('소모수량은 1 이상이어야 합니다.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/consumption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...consForm, input_by: userEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '등록 실패')
      setConsForm({ item_name: '', spec: '', quantity: 1, used_date: todayStr(), used_location: '', note: '' })
      setToastVisible(true)
      setTimeout(() => setToastVisible(false), 3000)
    } catch (err: any) {
      setSubmitError(err.message || '오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── 소모내역 열람 필터 ──
  const viewFiltered = viewRecords.filter(r => {
    const yy = r.used_date?.slice(2, 4)
    const mm = r.used_date ? String(parseInt(r.used_date.slice(5, 7))) : ''
    if (yy !== viewYearFilter) return false
    if (viewMonthFilter !== 'all' && mm !== viewMonthFilter) return false
    if (viewStatusFilter !== 'all' && r.status !== viewStatusFilter) return false
    return true
  })

  // ── 재고 요약 ──
  const totalItems = inventoryItems.length
  const shortageItems = inventoryItems.filter(i => i.stock <= 3).length
  const normalItems = totalItems - shortageItems

  // 세션 확인 전 빈 화면
  if (accessState === 'checking') {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-gray-400">로딩 중...</div>
  }

  // 권한 없음
  if (accessState === 'denied') {
    return (
      <div className="min-h-screen bg-gray-100">
        <InventoryHeader activeTab={activeTab} setActiveTab={setActiveTab} userEmail={userEmail} showTabs={false} />
        <div className="flex items-center justify-center px-4" style={{ minHeight: 'calc(100vh - 88px)' }}>
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
            <div className="text-4xl mb-3">🚫</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">접근 권한이 없습니다</h2>
            <p className="text-sm text-gray-500 mb-6">재고관리자 계정으로 로그인해주세요.</p>
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <InventoryHeader activeTab={activeTab} setActiveTab={setActiveTab} userEmail={userEmail} />

      {/* ─── 재고 현황 탭 ─── */}
      {activeTab === 'stock' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">재고 현황</h2>
                <button onClick={fetchInventory} className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">🔄 새로고침</button>
              </div>

              {/* 요약 카드 */}
              <div className="grid grid-cols-3 gap-3 mb-2">
                <div className="bg-white border rounded-xl p-4" style={{ borderLeft: '3px solid #0A67A6', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <p className="text-xs font-medium text-gray-500 mb-1">전체 품목 수</p>
                  <p className="text-xl font-bold text-gray-800">{totalItems}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4" style={{ borderLeft: '3px solid #C97A1E', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <p className="text-xs font-medium text-orange-700 mb-1">부족 품목 수</p>
                  <p className="text-xl font-bold text-orange-700">{shortageItems}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4" style={{ borderLeft: '3px solid #2E9E5B', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <p className="text-xs font-medium text-green-700 mb-1">정상 품목 수</p>
                  <p className="text-xl font-bold text-green-700">{normalItems}</p>
                </div>
              </div>
            </div>

            {inventoryLoading ? (
              <div className="py-16 text-center text-gray-400">불러오는 중...</div>
            ) : inventoryItems.length === 0 ? (
              <div className="py-16 text-center text-gray-400">재고 데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-t border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-gray-600 font-semibold">물품명</th>
                      <th className="px-4 py-3 text-left text-gray-600 font-semibold">규격</th>
                      <th className="px-4 py-3 text-right text-gray-600 font-semibold">입고량</th>
                      <th className="px-4 py-3 text-right text-gray-600 font-semibold">소모량</th>
                      <th className="px-4 py-3 text-right text-gray-600 font-semibold">현재고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.map((item, i) => {
                      const stockColor = item.stock <= 0 ? 'text-red-600' : item.stock <= 3 ? 'text-orange-600' : 'text-gray-800'
                      return (
                        <tr key={`${item.item_name}-${item.spec}-${i}`} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{item.item_name}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{item.spec || '-'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{item.incoming}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-700">{item.consumed}</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-bold ${stockColor}`}>
                            {item.stock}
                            {item.stock <= 0 && <span className="ml-1 text-xs font-semibold">🔴</span>}
                            {item.stock > 0 && item.stock <= 3 && <span className="ml-1 text-xs font-semibold">🟠</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 소모내역 입력 탭 ─── */}
      {activeTab === 'input' && (
        <div className="max-w-lg mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">소모내역 입력</h2>
            <form onSubmit={handleConsSubmit} className="space-y-5">

              {/* 입력자 — 로그인 계정으로 자동 입력 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">입력자</label>
                <input
                  type="text"
                  value={userEmail}
                  disabled
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>

              {/* 물품명 + 자동완성 */}
              <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">물품명 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={consForm.item_name}
                  onChange={e => handleItemNameChange(e.target.value)}
                  onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                  onFocus={() => autocompleteItems.length > 0 && setShowAutocomplete(true)}
                  placeholder="목록에 없으면 직접 입력하세요"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showAutocomplete && autocompleteItems.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {autocompleteItems.map((item, i) => (
                      <li
                        key={i}
                        onMouseDown={() => { setConsForm(p => ({ ...p, item_name: item })); setShowAutocomplete(false) }}
                        className="px-4 py-3 text-sm hover:bg-blue-50 cursor-pointer"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 규격 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">규격 <span className="text-gray-400 font-normal text-xs">(선택)</span></label>
                <input
                  type="text"
                  value={consForm.spec}
                  onChange={e => setConsForm(p => ({ ...p, spec: e.target.value }))}
                  placeholder="크기·용량·모델명 등"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 소모수량 + 사용일 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">소모수량 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={1}
                    value={consForm.quantity}
                    onChange={e => setConsForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">사용일 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={consForm.used_date}
                    onChange={e => setConsForm(p => ({ ...p, used_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 사용처 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">사용처 <span className="text-gray-400 font-normal text-xs">(선택)</span></label>
                <input
                  type="text"
                  value={consForm.used_location}
                  onChange={e => setConsForm(p => ({ ...p, used_location: e.target.value }))}
                  placeholder="예: 6호관 3층"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">메모 <span className="text-gray-400 font-normal text-xs">(선택)</span></label>
                <input
                  type="text"
                  value={consForm.note}
                  onChange={e => setConsForm(p => ({ ...p, note: e.target.value }))}
                  placeholder="자유 입력"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{submitError}</div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.08)' }}
              >
                {submitting ? '등록 중...' : '소모내역 등록'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── 소모내역 열람 탭 ─── */}
      {activeTab === 'view' && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 pb-4">
              <h2 className="text-lg font-bold text-gray-800 mb-2">소모내역 열람</h2>
              <p className="text-xs text-amber-600 mb-4">수정이 필요하면 최종관리자에게 문의하세요.</p>

              {/* 필터 바 */}
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  value={viewYearFilter}
                  onChange={e => setViewYearFilter(e.target.value)}
                  className="px-2 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {viewAvailableYears.map(yy => (
                    <option key={yy} value={yy}>{`20${yy}`}년</option>
                  ))}
                </select>
                <select
                  value={viewMonthFilter}
                  onChange={e => setViewMonthFilter(e.target.value)}
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
                    onClick={() => setViewStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      viewStatusFilter === s ? 'bg-[#0A67A6] text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                    }`}
                  >
                    {s === 'all' ? '전체' : CONSUMPTION_STATUS_LABEL[s]}
                  </button>
                ))}

                <button onClick={fetchViewRecords} className="ml-auto px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">🔄 새로고침</button>
              </div>
            </div>

            {viewLoading ? (
              <div className="py-16 text-center text-gray-400">불러오는 중...</div>
            ) : viewFiltered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">소모내역이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
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
                    {viewFiltered.map(rec => (
                      <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50">
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="bg-gray-800 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg">
            등록되었습니다
          </div>
        </div>
      )}
    </div>
  )
}
