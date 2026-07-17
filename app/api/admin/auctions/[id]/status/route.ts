import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['live', 'cancelled'],
  live:      ['ended', 'cancelled'],
  ended:     [],
  cancelled: [],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { status } = await req.json()
  const service = createServiceClient()

  const { data: current } = await service
    .from('auctions')
    .select('status')
    .eq('id', id)
    .single()

  if (!current) return NextResponse.json({ error: 'auction not found' }, { status: 404 })

  if (!VALID_TRANSITIONS[current.status]?.includes(status)) {
    return NextResponse.json(
      { error: `${current.status} → ${status} 전환 불가` },
      { status: 400 }
    )
  }

  const { error } = await service.from('auctions').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
