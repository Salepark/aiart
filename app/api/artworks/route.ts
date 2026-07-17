import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getImageMeta, computeFileHash, computePHash, extractExif } from '@/lib/screening/image'
import { runScreeningPipeline } from '@/lib/screening/pipeline'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'image required' }, { status: 400 })

  const title           = form.get('title') as string
  const declared_tool   = form.get('declared_tool') as string
  const declared_prompt = form.get('declared_prompt') as string
  const intent          = form.get('intent') as string
  const declared_width  = Number(form.get('declared_width'))
  const declared_height = Number(form.get('declared_height'))

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext    = file.name.split('.').pop() ?? 'jpg'
  const path   = `artworks/${user.id}/${Date.now()}.${ext}`

  // 1. Storage 업로드
  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('artworks')
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // 2. 이미지 분석
  const [meta, file_hash, phash, exif] = await Promise.all([
    getImageMeta(buffer),
    computeFileHash(buffer),
    computePHash(buffer),
    extractExif(buffer),
  ])

  // 3. DB insert
  const { data: artwork, error: dbError } = await service
    .from('artworks')
    .insert({
      artist_id: user.id,
      title,
      image_path: path,
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
      status: 'submitted',
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // AI 심사 파이프라인 비동기 실행 (응답을 블록하지 않음)
  runScreeningPipeline(artwork.id).catch(console.error)

  return NextResponse.json({ artwork }, { status: 201 })
}
