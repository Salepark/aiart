import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 관리자 role 확인
  const jwt = await supabase.auth.getSession()
  const role = (jwt.data.session?.user?.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { artwork_id, verdict, reason, layer, axis, attributed_to, confidence } = await req.json()
  if (!artwork_id || !verdict || !reason) {
    return NextResponse.json({ error: 'artwork_id, verdict, reason 필수' }, { status: 400 })
  }

  const service = createServiceClient()

  // screening_verdicts 추가
  const { error: verdictError } = await service.from('screening_verdicts').insert({
    artwork_id,
    verdict,
    reason,
    layer:        layer ?? null,
    axis:         axis ?? null,
    attributed_to: attributed_to ?? null,
    confidence:   confidence ?? null,
    decided_by:   'human',
  })
  if (verdictError) return NextResponse.json({ error: verdictError.message }, { status: 500 })

  // artworks.status 업데이트
  const statusMap: Record<string, string> = { pass: 'passed', flag: 'rejected', hold: 'held' }
  const newStatus = statusMap[verdict] ?? 'screening'
  const { error: statusError } = await service
    .from('artworks')
    .update({ status: newStatus })
    .eq('id', artwork_id)
  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
