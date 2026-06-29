export default function FooterBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
  const year = new Date().getFullYear()

  return (
    <div className="flex justify-center py-4 shrink-0">
      <span
        className="text-xs select-none"
        style={{
          background: '#F1F3F5',
          color: '#495057',
          border: '1px solid #DEE2E6',
          borderRadius: '999px',
          padding: '4px 14px',
          letterSpacing: '0.01em',
        }}
      >
        v{version} &copy; {year} Developed by 사무처 시설관리팀 박희찬
      </span>
    </div>
  )
}
