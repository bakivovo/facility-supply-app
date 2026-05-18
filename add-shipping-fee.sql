-- requests 테이블에 배송비 컬럼 추가
-- Supabase SQL Editor에서 실행하세요.
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS shipping_fee integer;
