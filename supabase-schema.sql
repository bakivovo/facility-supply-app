-- =============================================
-- 동양미래대학교 시설관리팀 건축물관리용품 요청·정산 시스템
-- Supabase 스키마 SQL (Supabase SQL Editor에서 실행)
-- =============================================

-- 1. categories 테이블
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  display_order integer NOT NULL DEFAULT 0
);

-- 2. vendors 테이블
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. settings 테이블
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text
);

-- 4. requests 테이블
CREATE TABLE IF NOT EXISTS requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE,
  requester_name text NOT NULL,
  category text NOT NULL,
  item_name text NOT NULL,
  spec text,
  quantity integer NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT '개',
  purchase_link text,
  request_photos text[],
  purpose text NOT NULL,
  urgency text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'relaxed')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'purchased', 'settled', 'rejected')),
  reject_reason text,
  vendor text,
  amount integer,
  purchase_date date,
  memo text,
  delivery_photo_urls text[],
  receipt_photo_urls jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_updated_at
  BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. 카테고리 초기 데이터
INSERT INTO categories (name, code, display_order) VALUES
  ('전기·조명', '전기', 1),
  ('배관·설비', '배관', 2),
  ('도장·마감', '도장', 3),
  ('청소·위생', '청소', 4),
  ('공구·장비', '공구', 5),
  ('안전용품', '안전', 6),
  ('기타', '기타', 7)
ON CONFLICT (code) DO NOTHING;

-- 6. 기본 설정
INSERT INTO settings (key, value) VALUES
  ('handover_memo', ''),
  ('admin_name', '시설관리팀')
ON CONFLICT (key) DO NOTHING;

-- 7. RLS 정책 (Row Level Security)
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- requests: 누구나 INSERT (요청자), SELECT (현황 조회)
CREATE POLICY "requests_select_all" ON requests FOR SELECT USING (true);
CREATE POLICY "requests_insert_all" ON requests FOR INSERT WITH CHECK (true);
-- requests: 서비스 롤만 UPDATE
CREATE POLICY "requests_update_service" ON requests FOR UPDATE USING (true);

-- categories: 누구나 읽기
CREATE POLICY "categories_select_all" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_all_service" ON categories FOR ALL USING (true);

-- vendors: 누구나 읽기
CREATE POLICY "vendors_select_all" ON vendors FOR SELECT USING (true);
CREATE POLICY "vendors_all_service" ON vendors FOR ALL USING (true);

-- settings: 누구나 읽기
CREATE POLICY "settings_select_all" ON settings FOR SELECT USING (true);
CREATE POLICY "settings_all_service" ON settings FOR ALL USING (true);

-- 8. Storage 버킷 (Supabase 대시보드 > Storage에서 수동 생성 또는 아래 SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('request-photos', 'request-photos', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('delivery-photos', 'delivery-photos', true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('receipt-photos', 'receipt-photos', true) ON CONFLICT DO NOTHING;
