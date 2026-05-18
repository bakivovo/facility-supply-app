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
