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
    { key: 'dashboard', label: '📋 요청 목록' },
    { key: 'monthly',   label: '📊 월별 정산' },
    { key: 'settings',  label: '⚙️ 설정'     },
  ]

  return (
    <header style={{ backgroundColor: '#0A67A6' }} className="text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">

          {/* 워드마크 + 타이틀 */}
          <div className="flex items-center gap-3">
            <div className="bg-white rounded-md px-2 py-1 shrink-0 flex items-center justify-center">
              <Image
                src="/brand/워드마크.png.png"
                alt="동양미래대학교"
                width={80}
                height={28}
                className="object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-base opacity-70">사무처 시설관리팀</p>
              <h1 className="text-xl font-bold leading-tight">건축물관리용품 관리 시스템</h1>
            </div>
          </div>

          {/* 로그아웃 — DMU Yellow */}
          <button
            onClick={handleLogout}
            style={{ backgroundColor: '#EDE900', color: '#1a1a00' }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:brightness-95 transition"
          >
            로그아웃
          </button>
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
