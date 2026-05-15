// 인증 체크는 각 페이지에서 직접 수행 — 여기서 redirect 하면 /admin/login까지 루프에 빠짐
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
