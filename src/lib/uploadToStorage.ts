/**
 * 브라우저에서 Supabase Storage로 직접 업로드.
 * Vercel Function을 거치지 않으므로 4.5MB 페이로드 제한 없음.
 */
import { createClient } from '@/lib/supabase/client'

export async function uploadToStorage(
  file: File,
  bucket: string
): Promise<string> {
  const supabase = createClient()

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) throw new Error(`업로드 실패: ${error.message}`)

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

/** 여러 파일을 순서대로 업로드하고 URL 배열 반환 */
export async function uploadManyToStorage(
  files: File[],
  bucket: string
): Promise<string[]> {
  const urls: string[] = []
  for (const file of files) {
    const url = await uploadToStorage(file, bucket)
    urls.push(url)
  }
  return urls
}

/** Public URL → Storage 경로를 추출해 파일 삭제 */
export async function deleteFromStorage(
  publicUrl: string,
  bucket: string
): Promise<void> {
  const supabase = createClient()
  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return  // 버킷 외부 URL은 무시
  const filePath = decodeURIComponent(publicUrl.slice(idx + marker.length).split('?')[0])
  await supabase.storage.from(bucket).remove([filePath])
}
