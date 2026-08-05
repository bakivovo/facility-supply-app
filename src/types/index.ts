export type Urgency = 'normal' | 'urgent' | 'relaxed'
export type Status = 'new' | 'reviewing' | 'ordered' | 'settled' | 'rejected'

export interface Request {
  id: string
  receipt_number: string | null
  requester_name: string
  category: string
  item_name: string
  spec: string | null
  quantity: number
  unit: string
  purchase_link: string | null
  request_photos: string[] | null
  purpose: string
  urgency: Urgency
  status: Status
  reject_reason: string | null
  vendor: string | null
  unit_price: number | null
  purchase_quantity: number | null
  amount: number | null
  shipping_fee: number | null
  purchase_date: string | null
  memo: string | null
  purchase_month: string | null
  delivery_photo_urls: string[] | null
  receipt_photo_urls: ReceiptPhoto[] | null
  delivery_receipt_photo_urls: string[] | null
  created_at: string
  updated_at: string
}

export interface ReceiptPhoto {
  label: string
  url: string
}

export interface Category {
  id: string
  name: string
  code: string
  display_order: number
}

export interface Vendor {
  id: string
  name: string
  created_at: string
}

export const STATUS_LABEL: Record<Status, string> = {
  new: '신규',
  reviewing: '검토중',
  ordered: '주문완료',
  settled: '정산완료',
  rejected: '반려',
}

export const STATUS_COLOR: Record<Status, string> = {
  new:       'bg-green-100 text-green-700',
  reviewing: 'bg-orange-100 text-orange-700',
  ordered:   'bg-purple-100 text-purple-700',
  settled:   'bg-[#EDE900] text-[#3a3800]',
  rejected:  'bg-red-100 text-red-700',
}

export const URGENCY_LABEL: Record<Urgency, string> = {
  normal: '일반',
  urgent: '긴급',
  relaxed: '여유',
}

export const URGENCY_COLOR: Record<Urgency, string> = {
  normal: 'bg-gray-100 text-gray-600',
  urgent: 'bg-red-100 text-red-700',
  relaxed: 'bg-blue-100 text-blue-700',
}

export const UNITS = ['개', '세트', '롤', 'm', 'kg', 'L', '박스', '기타']

export const STATUS_FLOW: Record<Status, Status | null> = {
  new: 'reviewing',
  reviewing: 'ordered',
  ordered: 'settled',
  settled: null,
  rejected: null,
}

export const NEXT_STATUS_LABEL: Record<Status, string> = {
  new: '검토중으로 변경',
  reviewing: '주문완료로 변경',
  ordered: '정산완료로 변경',
  settled: '',
  rejected: '',
}

// ── 소모내역 ──
export type ConsumptionStatus = 'pending' | 'confirmed'

export interface ConsumptionRecord {
  id: string
  item_name: string
  spec: string | null
  quantity: number
  used_date: string
  used_location: string | null
  status: ConsumptionStatus
  input_by: string
  input_at: string
  confirmed_by: string | null
  confirmed_at: string | null
  note: string | null
  created_at: string
}

export const CONSUMPTION_STATUS_LABEL: Record<ConsumptionStatus, string> = {
  pending: '대기',
  confirmed: '확인완료',
}

export const CONSUMPTION_STATUS_COLOR: Record<ConsumptionStatus, string> = {
  pending: 'bg-orange-100 text-orange-700',
  confirmed: 'bg-green-100 text-green-700',
}
