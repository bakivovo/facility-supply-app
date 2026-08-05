'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminHeader({ activeTab, setActiveTab }: {
  activeTab: string
  setActiveTab: (tab: string) => void
}) {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const tabs = [
    { key: 'dashboard',    label: '📋 요청 목록' },
    { key: 'monthly',      label: '📊 월별 정산' },
    { key: 'consumption',  label: '📦 소모내역' },
    { key: 'settings',     label: '⚙️ 설정'     },
  ]

  return (
    <header style={{ background: 'linear-gradient(180deg, #0d77bd, #0A67A6)', boxShadow: '0 2px 4px rgba(0,0,0,0.12)' }} className="text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">

          {/* 워드마크 + 타이틀 */}
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
              <h1 className="text-xl font-bold leading-tight">건축물관리용품 관리 시스템</h1>
            </div>
          </div>

          {/* 버전 배지 + 로그아웃 */}
          <div className="flex flex-col items-end gap-1.5">
            <span
              className="text-[10px] leading-none select-none"
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
            <div className="flex items-center gap-1.5">
              <a
                href="/request"
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium transition whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: '999px' }}
              >
                <span className="text-sm leading-none">📋</span>
                <span>요청 페이지</span>
              </a>
              <button
                onClick={handleLogout}
                style={{ backgroundColor: '#EDE900', color: '#1a1a00', boxShadow: '0 2px 0 rgba(0,0,0,0.08)' }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:brightness-95 transition whitespace-nowrap"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <nav className="flex gap-1 pb-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === tab.key
                  ? 'bg-white text-[#0A67A6]'
                  : 'text-white/75 hover:text-white hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  )
}
