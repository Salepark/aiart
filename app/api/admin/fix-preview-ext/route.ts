import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

// .png 경로에 JPEG 내용이 들어간 파일을 .jpg로 교정하는 일회성 API
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()

  // preview_path가 .png인 작품 조회
  const { data: artworks } = await service
    .from('artworks')
    .select('id, preview_path, image_path')
    .or('preview_path.like.%.png,image_path.like.%.png')

  if (!artworks?.length) return NextResponse.json({ message: '수정할 작품 없음', fixed: 0 })

  const results = []

  for (const aw of artworks) {
    const oldPath = aw.preview_path
    const newPath = oldPath.replace(/\.png$/, '.jpg')

    // 다운로드
    const { data: file, error: dlErr } = await service.storage.from('artworks').download(oldPath)
    if (dlErr) { results.push({ id: aw.id, error: 'download: ' + dlErr.message }); continue }

    // .jpg로 재업로드
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await service.storage.from('artworks').upload(newPath, buffer, {
      contentType: 'image/jpeg', upsert: false,
    })
    if (upErr) { results.push({ id: aw.id, error: 'upload: ' + upErr.message }); continue }

    // DB 업데이트
    const { error: dbErr } = await service.from('artworks').update({
      preview_path: newPath,
      image_path:   newPath,
    }).eq('id', aw.id)
    if (dbErr) { results.push({ id: aw.id, error: 'db: ' + dbErr.message }); continue }

    // 기존 .png 삭제
    await service.storage.from('artworks').remove([oldPath])
    results.push({ id: aw.id, status: 'fixed', newPath })
  }

  return NextResponse.json({ fixed: results.filter(r => r.status === 'fixed').length, results })
}
