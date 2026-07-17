import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getImageMeta, computeFileHash, computePHash, extractExif } from '@/lib/screening/image'
import { addPreviewWatermark } from '@/lib/screening/watermark'
import { runScreeningPipeline } from '@/lib/screening/pipeline'

// Vercel 함수 타임아웃: 60초 (기본 10초로는 이미지 처리 + 2회 Storage 업로드가 부족)
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'image required' }, { status: 400 })

  // 파일 크기 제한 100MB
  if (file.size > 100 * 1024 * 1024) {
    return NextResponse.json({ error: '파일 크기는 100MB 이하여야 합니다' }, { status: 400 })
  }

  const title           = form.get('title') as string
  const declared_tool   = form.get('declared_tool') as string
  const declared_prompt = form.get('declared_prompt') as string
  const intent          = form.get('intent') as string
  const declared_width  = Number(form.get('declared_width'))
  const declared_height = Number(form.get('declared_height'))
  const sale_type       = (form.get('sale_type') as string) || 'exclusive'
  const edition_total   = Number(form.get('edition_total') || 1)
  const license_scope   = (form.get('license_scope') as string) || null
  const asking_price    = form.get('asking_price') ? Number(form.get('asking_price')) : null

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext    = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const ts     = Date.now()

  const service = createServiceClient()

  // 1. 원본 → 비공개 originals 버킷 + 워터마크 미리보기 + 이미지 분석 병렬 실행
  const [origResult, previewBuffer, meta, file_hash, phash, exif] = await Promise.all([
    service.storage
      .from('originals')
      .upload(`artworks/${user.id}/${ts}_original.${ext}`, buffer, {
        contentType: file.type, upsert: false,
      }),
    addPreviewWatermark(buffer),
    getImageMeta(buffer),
    computeFileHash(buffer),
    computePHash(buffer),
    extractExif(buffer),
  ])

  if (origResult.error) {
    console.error('[artworks] originals upload error:', origResult.error)
    return NextResponse.json({ error: `원본 업로드 실패: ${origResult.error.message}` }, { status: 500 })
  }

  const originalPath = origResult.data.path

  // 2. 미리보기 → 공개 artworks 버킷
  const previewPath = `artworks/${user.id}/${ts}_preview.jpg`
  const { error: prevErr } = await service.storage
    .from('artworks')
    .upload(previewPath, previewBuffer, { contentType: 'image/jpeg', upsert: false })

  if (prevErr) {
    console.error('[artworks] preview upload error:', prevErr)
    return NextResponse.json({ error: `미리보기 업로드 실패: ${prevErr.message}` }, { status: 500 })
  }

  // 3. DB insert
  const { data: artwork, error: dbError } = await service
    .from('artworks')
    .insert({
      artist_id:     user.id,
      title,
      image_path:    previewPath,
      preview_path:  previewPath,
      original_path: originalPath,
      declared_tool,
      declared_prompt,
      intent,
      declared_width,
      declared_height,
      actual_width:  meta.actual_width,
      actual_height: meta.actual_height,
      file_hash,
      phash,
      exif,
      sale_type,
      edition_total,
      license_scope,
      asking_price,
      status: 'submitted',
    })
    .select()
    .single()

  if (dbError) {
    console.error('[artworks] db insert error:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  // AI 심사 파이프라인 비동기 실행 (응답 블록하지 않음)
  runScreeningPipeline(artwork.id).catch(e =>
    console.error('[artworks] screening pipeline error:', e)
  )

  return NextResponse.json({ artwork }, { status: 201 })
}
