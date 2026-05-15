'use client'

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
    { key: 'monthly', label: '📊 월별 정산' },
    { key: 'settings', label: '⚙️ 설정' },
  ]

  return (
    <header className="bg-blue-800 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs opacity-70">동양미래대학교 사무처 시설관리팀</p>
            <h1 className="text-base font-bold">건축물관리용품 관리 시스템</h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded-lg transition"
          >
            로그아웃
          </button>
        </div>
        <nav className="flex gap-1 pb-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                activeTab === tab.key
                  ? 'bg-white text-blue-800'
                  : 'text-blue-200 hover:text-white hover:bg-blue-700'
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
