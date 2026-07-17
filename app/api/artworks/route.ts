import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runScreeningPipeline } from '@/lib/screening/pipeline'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    originalPath, previewPath, file_hash,
    title, declared_tool, declared_prompt, intent,
    declared_width, declared_height,
    sale_type, edition_total, license_scope, asking_price,
  } = body

  if (!originalPath || !previewPath || !title) {
    return NextResponse.json({ error: 'originalPath, previewPath, title 필수' }, { status: 400 })
  }

  // 경로가 본인 소유인지 검증
  const expectedPrefix = `artworks/${user.id}/`
  if (!originalPath.startsWith(expectedPrefix) || !previewPath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: '잘못된 파일 경로입니다' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: artwork, error: dbError } = await service
    .from('artworks')
    .insert({
      artist_id:      user.id,
      title,
      image_path:     previewPath,
      preview_path:   previewPath,
      original_path:  originalPath,
      declared_tool:  declared_tool  ?? null,
      declared_prompt: declared_prompt ?? null,
      intent:         intent         ?? null,
      declared_width:  declared_width  ? Number(declared_width)  : null,
      declared_height: declared_height ? Number(declared_height) : null,
      file_hash:      file_hash      ?? null,
      sale_type:      sale_type      ?? 'exclusive',
      edition_total:  edition_total  ? Number(edition_total)  : 1,
      license_scope:  license_scope  ?? null,
      asking_price:   asking_price   ? Number(asking_price)   : null,
      status: 'submitted',
    })
    .select()
    .single()

  if (dbError) {
    console.error('[artworks] db insert error:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // AI 심사 파이프라인 비동기 실행 (워터마크 생성 포함)
  runScreeningPipeline(artwork.id).catch(e =>
    console.error('[artworks] screening pipeline error:', e)
  )

  return NextResponse.json({ artwork }, { status: 201 })
}
