import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ext } = await req.json()
  const safeExt = (ext ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  const ts = Date.now()

  const originalPath = `artworks/${user.id}/${ts}_original.${safeExt}`
  const previewPath  = `artworks/${user.id}/${ts}_preview.${safeExt}`

  const service = createServiceClient()

  // originals(비공개) + artworks(공개) 양쪽 서명 업로드 URL 병렬 생성
  const [origSigned, prevSigned] = await Promise.all([
    service.storage.from('originals').createSignedUploadUrl(originalPath),
    service.storage.from('artworks').createSignedUploadUrl(previewPath),
  ])

  if (origSigned.error) {
    return NextResponse.json({ error: 'originals URL 생성 실패: ' + origSigned.error.message }, { status: 500 })
  }
  if (prevSigned.error) {
    return NextResponse.json({ error: 'artworks URL 생성 실패: ' + prevSigned.error.message }, { status: 500 })
  }

  return NextResponse.json({
    originalSignedUrl: origSigned.data.signedUrl,
    previewSignedUrl:  prevSigned.data.signedUrl,
    originalPath,
    previewPath,
  })
}
