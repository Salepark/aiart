import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { artwork_id, start_price, reserve_price, start_at, end_at, auto_extend_minutes } =
    await req.json()

  if (!artwork_id || !start_price || !start_at || !end_at) {
    return NextResponse.json({ error: 'artwork_id, start_price, start_at, end_at 필수' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('auctions')
    .insert({
      artwork_id,
      start_price:          Number(start_price),
      current_price:        Number(start_price),
      reserve_price:        reserve_price ? Number(reserve_price) : null,
      start_at,
      end_at,
      auto_extend_minutes:  auto_extend_minutes ? Number(auto_extend_minutes) : 5,
      status: 'scheduled',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ auction: data }, { status: 201 })
}
