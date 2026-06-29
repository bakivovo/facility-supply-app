'use client'

import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { UNITS, STATUS_LABEL, STATUS_COLOR, type Category } from '@/types'
import { uploadManyToStorage } from '@/lib/uploadToStorage'

export default function RequestPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({
    requester_name: '',
    category: '',
    category_code: '',
    item_name: '',
    spec: '',
    quantity: 1,
    unit: '개',
    purchase_link: '',
    purpose: '',
    urgency: 'normal' as 'normal' | 'urgent' | 'relaxed',
  })
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([])
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ receipt_number: string } | null>(null)
  const [error, setError] = useState('')

  // 통합 검색 (이름 OR 물품명 OR 규격)
  const [showGuide, setShowGuide] = useState(false)
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResults, setLookupResults] = useState<any[] | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupYearFilter, setLookupYearFilter] = useState('all')
  const [lookupMonthFilter, setLookupMonthFilter] = useState('all')
  const [lookupAvailableYears, setLookupAvailableYears] = useState<string[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const autocompleteTimer = useRef<NodeJS.Timeout | undefined>(undefined)

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(d.data || []))
  }, [])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const remaining = 3 - photos.length
    const newFiles = files.slice(0, remaining)
    setPhotos(prev => [...prev, ...newFiles])
    const previews = newFiles.map(f => URL.createObjectURL(f))
    setPhotoPreviews(prev => [...prev, ...previews])
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx))
    setPhotoPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  const handleItemNameChange = (val: string) => {
    setForm(prev => ({ ...prev, item_name: val }))
    clearTimeout(autocompleteTimer.current)
    if (val.length < 1) { setAutocompleteItems([]); setShowAutocomplete(false); return }
    autocompleteTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/requests?autocomplete=${encodeURIComponent(val)}`)
      const data = await res.json()
      setAutocompleteItems(data.items || [])
      setShowAutocomplete(true)
    }, 250)
  }

  const uploadPhotos = async (): Promise<string[]> => {
    // 브라우저 → Supabase Storage 직접 업로드 (Vercel 페이로드 한도 우회)
    return uploadManyToStorage(photos, 'request-photos')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.requester_name || !form.category || !form.item_name || !form.purpose || !form.urgency) {
      setError('필수 항목을 모두 입력해주세요.')
      return
    }
    if (form.quantity < 1) {
      setError('수량은 1 이상이어야 합니다.')
      return
    }
    setSubmitting(true)
    try {
      const photoUrls = photos.length > 0 ? await uploadPhotos() : []
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, request_photos: photoUrls }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '제출 실패')
      setSubmitResult({ receipt_number: data.receipt_number })
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLookupError('')
    setLookupResults(null)
    if (!lookupQuery.trim()) { setLookupError('검색어를 입력해주세요.'); return }
    setLookupLoading(true)
    try {
      const res = await fetch(`/api/requests?query=${encodeURIComponent(lookupQuery.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '조회 실패')
      const all: any[] = data.data || []

      // 연도 목록 자동 생성 (접수번호 YY 기준)
      const yearSet = new Set<string>()
      all.forEach((r: any) => {
        const yy = r.receipt_number?.split('-')[0]
        if (yy && /^\d{2}$/.test(yy)) yearSet.add(yy)
      })
      setLookupAvailableYears(Array.from(yearSet).sort().reverse())

      setLookupResults(all)
    } catch (err: any) {
      setLookupError(err.message)
    } finally {
      setLookupLoading(false)
    }
  }

  // 연도·월 필터 적용
  const filteredLookupResults = lookupResults === null ? null : lookupResults.filter((r: any) => {
    if (lookupYearFilter !== 'all') {
      const yy = r.receipt_number?.split('-')[0]
      if (yy !== lookupYearFilter) return false
    }
    if (lookupMonthFilter !== 'all') {
      const mm = r.receipt_number?.split('-')[1]
      if (!mm || parseInt(mm) !== parseInt(lookupMonthFilter)) return false
    }
    return true
  })

  // 제출 완료 화면
  if (submitResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">요청이 접수되었습니다</h2>
          <div className="bg-blue-50 rounded-xl p-4 mt-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">접수번호</p>
            <p className="text-2xl font-bold text-blue-700 tracking-wider">{submitResult.receipt_number}</p>
          </div>
          <p className="text-gray-500 text-sm mb-6">이 번호로 처리 현황을 확인하세요</p>
          <button
            onClick={() => {
              setSubmitResult(null)
              setForm({ requester_name: '', category: '', category_code: '', item_name: '', spec: '', quantity: 1, unit: '개', purchase_link: '', purpose: '', urgency: 'normal' })
              setPhotos([])
              setPhotoPreviews([])
            }}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold text-lg hover:bg-blue-700 transition"
            style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.08)' }}
          >
            새 요청 작성하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header style={{ background: 'linear-gradient(180deg, #0d77bd, #0A67A6)', boxShadow: '0 2px 4px rgba(0,0,0,0.12)' }} className="text-white shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-md px-2 py-1 shrink-0 self-stretch flex items-center justify-center">
              <Image
                src="/brand/wordmark.png"
                alt="동양미래대학교"
                width={48}
                height={48}
                className="object-contain h-full w-auto"
                priority
              />
            </div>
            <div>
              <p className="text-base opacity-70">사무처 시설관리팀</p>
              <h1 className="text-xl font-bold leading-tight">물품 요청서</h1>
            </div>
          </div>
          {/* 우측: 버전 배지 + 버튼 묶음 */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* 버전 배지 */}
            <span
              className="text-[10px] leading-none select-none whitespace-nowrap"
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '999px',
                padding: '3px 10px',
              }}
            >
              v{process.env.NEXT_PUBLIC_APP_VERSION} &copy; {new Date().getFullYear()} 사무처 시설관리팀 박희찬
            </span>
            {/* 관리자 + 이용방법 버튼 */}
            <div className="flex items-center gap-1.5">
              <a
                href="/admin"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: '999px' }}
              >
                <span className="text-sm leading-none">🔒</span>
                <span>관리자</span>
              </a>
              <button
                type="button"
                onClick={() => setShowGuide(v => !v)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: '999px' }}
              >
                <span className="text-sm leading-none">?</span>
                <span>이용방법</span>
              </button>
            </div>
          </div>
        </div>

        {/* 이용방법 패널 */}
        {showGuide && (
          <div className="px-4 pb-4">
            <div className="rounded-xl px-4 py-4" style={{ background: '#FFFBE0', border: '1px solid #EDE900' }}>
              <p className="text-sm font-bold mb-3" style={{ color: '#5C5300' }}>이용방법</p>
              <ol className="space-y-2">
                {[
                  ['요청 작성', '카테고리·물품명·수량·용도 입력 후 등록'],
                  ['검토·주문', '시설관리팀이 확인 후 구매 진행'],
                  ['구입완료', '도착 시 구입가격·구입처 표시'],
                  ['정산완료', '처리 종료, 최종 확정 상태'],
                ].map(([title, desc], i) => (
                  <li key={i} className="flex items-start gap-2 text-xs" style={{ color: '#5C5300' }}>
                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold leading-none mt-0.5" style={{
                      background: 'linear-gradient(180deg, #0d77bd, #0A67A6)',
                    }}>{i + 1}</span>
                    <span><span className="font-semibold">{title}</span> — {desc}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </header>

      {/* 2분할 본문 */}
      <main className="flex flex-col md:flex-row flex-1 min-h-0">

        {/* ── 왼쪽: 요청 폼 ── */}
        <div className="w-full md:w-1/2 overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200 px-5 py-6 bg-white">
        <form onSubmit={handleSubmit} className="space-y-5 max-w-lg mx-auto">

          {/* 이름 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">이름 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.requester_name}
              onChange={e => setForm(p => ({ ...p, requester_name: e.target.value }))}
              placeholder="성함을 입력하세요"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 카테고리 칩 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">물품 카테고리 <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, category: cat.name, category_code: cat.code }))}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                    form.category === cat.name
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 물품명 + 자동완성 */}
          <div className="relative">
            <label className="block text-sm font-semibold text-gray-700 mb-1">물품명 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.item_name}
              onChange={e => handleItemNameChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
              onFocus={() => autocompleteItems.length > 0 && setShowAutocomplete(true)}
              placeholder="예: LED 형광등, 배수관 부품"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showAutocomplete && autocompleteItems.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                {autocompleteItems.map((item, i) => (
                  <li
                    key={i}
                    onMouseDown={() => { setForm(p => ({ ...p, item_name: item })); setShowAutocomplete(false) }}
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
              value={form.spec}
              onChange={e => setForm(p => ({ ...p, spec: e.target.value }))}
              placeholder="크기·용량·모델명 등 구입에 필요한 사양"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 수량 + 단위 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-1">수량 <span className="text-red-500">*</span></label>
              <input
                type="number"
                min={1}
                value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: parseInt(e.target.value) || 1 }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-semibold text-gray-700 mb-1">단위</label>
              <select
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* 구입 참고 링크 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">구입 참고 링크 <span className="text-gray-400 font-normal text-xs">(선택)</span></label>
            <input
              type="url"
              value={form.purchase_link}
              onChange={e => setForm(p => ({ ...p, purchase_link: e.target.value }))}
              placeholder="쿠팡·네이버쇼핑 등 참고할 상품 링크"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 사진 첨부 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              사진 첨부 <span className="text-gray-400 font-normal text-xs">(선택 · 최대 3장)</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">교체 대상·파손 부위 사진 (구입 규격 파악에 도움)</p>
            <div className="flex gap-2 flex-wrap">
              {photoPreviews.map((src, i) => (
                <div key={i} className="relative w-24 h-24">
                  <img src={src} alt="" className="w-24 h-24 object-cover rounded-xl border" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold"
                  >×</button>
                </div>
              ))}
              {photos.length < 3 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition text-sm"
                >
                  <span className="text-2xl">+</span>
                  <span className="text-xs mt-1">사진 추가</span>
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          {/* 사용 용도 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">사용 용도 / 요청 사유 <span className="text-red-500">*</span></label>
            <textarea
              value={form.purpose}
              onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
              rows={3}
              placeholder="어디에, 왜 필요한지 간략히 적어주세요"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 긴급도 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">긴급도 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              {(['normal', 'urgent', 'relaxed'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, urgency: u }))}
                  className={`flex-1 py-3 rounded-xl font-medium text-sm border-2 transition ${
                    form.urgency === u
                      ? u === 'urgent'
                        ? 'bg-red-600 text-white border-red-600'
                        : u === 'relaxed'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-gray-600 text-white border-gray-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {u === 'urgent' ? '🔴 긴급' : u === 'relaxed' ? '🔵 여유' : '⚪ 일반'}
                  {u === 'urgent' && <span className="block text-xs font-normal opacity-80">3일 내</span>}
                  {u === 'relaxed' && <span className="block text-xs font-normal opacity-80">1주 이상</span>}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 2px 0 rgba(0,0,0,0.08)' }}
          >
            {submitting ? '제출 중...' : '요청 제출하기'}
          </button>
        </form>
        </div>{/* /왼쪽 칼럼 */}

        {/* ── 오른쪽: 내 요청 조회 ── */}
        <div className="w-full md:w-1/2 overflow-y-auto px-5 py-6 bg-gray-50">
          <div className="max-w-lg mx-auto">
          <h2 className="text-base font-bold text-gray-700 mb-1">내 요청 조회</h2>
          <p className="text-xs text-gray-400 mb-3">이름으로 제출한 모든 요청을 확인할 수 있습니다.</p>
          <form onSubmit={handleLookup} className="flex gap-2">
            <input
              type="text"
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              placeholder="이름 또는 물품명으로 검색"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={lookupLoading}
              className="px-5 py-3 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 transition disabled:opacity-60"
            >
              {lookupLoading ? '...' : '조회'}
            </button>
          </form>

          {/* 연도·월 필터 — 조회 결과가 있을 때만 표시 */}
          {lookupResults !== null && (
            <div className="flex gap-2 mt-3">
              <select
                value={lookupYearFilter}
                onChange={e => setLookupYearFilter(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">전체 연도</option>
                {lookupAvailableYears.map(yy => (
                  <option key={yy} value={yy}>20{yy}년</option>
                ))}
              </select>
              <select
                value={lookupMonthFilter}
                onChange={e => setLookupMonthFilter(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">전체 월</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={String(m)}>{m}월</option>
                ))}
              </select>
            </div>
          )}

          {lookupError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{lookupError}</div>
          )}

          {filteredLookupResults !== null && (
            <div className="mt-3 space-y-2">
              {filteredLookupResults.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {lookupResults?.length === 0 ? '요청 내역이 없습니다.' : '선택한 기간에 해당하는 요청이 없습니다.'}
                </div>
              ) : (
                filteredLookupResults.map((r: any) => {
                  const isPurchased = r.status === 'purchased' || r.status === 'settled'
                  return (
                    <div key={r.receipt_number} className="bg-white rounded-xl p-4" style={{ border: '0.5px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                      {/* 상단: 접수번호 + 상태 배지 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-xs text-gray-500">{r.receipt_number}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLOR[r.status as keyof typeof STATUS_COLOR]}`}>
                          {STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]}
                        </span>
                      </div>

                      {/* 물품명 + 규격 */}
                      <p className="font-semibold text-gray-800 text-sm">
                        {r.item_name}
                        {r.spec && <span className="text-gray-400 font-normal ml-1.5 text-xs">({r.spec})</span>}
                      </p>

                      {/* 기본 정보 행 */}
                      <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                        <span>접수일 {r.created_at?.slice(0, 10)}</span>
                        <span>요청수량 {r.quantity}{r.unit}</span>
                      </div>

                      {/* 용도 */}
                      {r.purpose && (
                        <p className="mt-1 text-xs text-gray-500">
                          <span className="text-gray-400">용도:</span> {r.purpose}
                        </p>
                      )}

                      {/* 구입 정보 — 구입완료·정산완료만 표시 */}
                      {isPurchased && (
                        <div className="mt-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {r.unit_price != null && (
                            <div>
                              <span className="text-gray-400">구입단가</span>
                              <span className="ml-1.5 font-medium text-gray-700">{r.unit_price.toLocaleString()}원</span>
                            </div>
                          )}
                          <div>
                            <span className="text-gray-400">구입수량</span>
                            <span className="ml-1.5 font-medium text-gray-700">
                              {(r.purchase_quantity ?? r.quantity)}{r.unit}
                            </span>
                          </div>
                          {r.purchase_date && (
                            <div>
                              <span className="text-gray-400">구입일자</span>
                              <span className="ml-1.5 font-medium text-gray-700">{r.purchase_date}</span>
                            </div>
                          )}
                          {r.amount != null && (
                            <div>
                              <span className="text-gray-400">구입금액</span>
                              <span className="ml-1.5 font-semibold text-blue-700">{r.amount.toLocaleString()}원</span>
                            </div>
                          )}
                          {r.vendor && r.vendor.startsWith('http') && (
                            <div className="col-span-2 pt-1">
                              <a
                                href={r.vendor}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-medium"
                              >
                                🔗 구입처 링크
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 반려 사유 */}
                      {r.status === 'rejected' && r.reject_reason && (
                        <div className="mt-2 bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
                          <span className="font-semibold">반려 사유:</span> {r.reject_reason}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
          </div>
        </div>{/* /오른쪽 칼럼 */}

      </main>
    </div>
  )
}
