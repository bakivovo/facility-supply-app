-- 구입수량 컬럼 추가 (요청수량 quantity와 분리)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS purchase_quantity integer;
