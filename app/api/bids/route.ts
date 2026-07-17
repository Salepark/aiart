import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { auction_id, amount } = await req.json()
  if (!auction_id || !amount) {
    return NextResponse.json({ error: 'auction_id, amount 필수' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('place_bid', {
    p_auction_id: auction_id,
    p_bidder_id:  user.id,
    p_amount:     Number(amount),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
