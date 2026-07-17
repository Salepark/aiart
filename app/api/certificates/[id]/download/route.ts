import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const service = createServiceClient()

  // 낙찰자 본인 확인
  const { data: cert } = await service
    .from('certificates')
    .select('buyer_id, original_path')
    .eq('id', id)
    .eq('buyer_id', user.id)
    .maybeSingle()

  if (!cert) return NextResponse.json({ error: '인증서를 찾을 수 없습니다' }, { status: 404 })
  if (!cert.original_path) return NextResponse.json({ error: '파일 경로가 없습니다' }, { status: 400 })

  // 서명된 URL 생성 (1시간 만료)
  const { data, error } = await service.storage
    .from('originals')
    .createSignedUrl(cert.original_path, 3600)

  if (error || !data) {
    return NextResponse.json({ error: '다운로드 URL 생성 실패: ' + error?.message }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, expires_in: 3600 })
}
