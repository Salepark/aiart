export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import AuctionClient from './AuctionClient'

export default async function AuctionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: auction } = await supabase
    .from('auctions')
    .select('*, artworks(id, title, image_path, intent, declared_tool, artists(display_name))')
    .eq('id', id)
    .single()

  if (!auction) notFound()

  const { data: bids } = await supabase
    .from('bids')
    .select('id, amount, created_at, bidder_id')
    .eq('auction_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: { user } } = await supabase.auth.getUser()

  const artwork = auction.artworks as {
    id: string; title: string; image_path: string;
    intent: string | null; declared_tool: string | null;
    artists: { display_name: string } | null
  } | null

  const { data: urlData } = supabase.storage
    .from('artworks')
    .getPublicUrl(artwork?.image_path ?? '')

  return (
    <div className="min-h-screen bg-white py-10">
      <div className="max-w-5xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-10">
          {/* 작품 이미지 + 정보 */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
              {artwork?.image_path && (
                <Image src={urlData.publicUrl} alt={artwork.title} fill className="object-contain" />
              )}
            </div>
            <h1 className="text-xl font-bold">{artwork?.title}</h1>
            <p className="text-gray-500 text-sm">
              작가: {(artwork?.artists as { display_name: string } | null)?.display_name ?? '-'}
            </p>
            {artwork?.declared_tool && (
              <p className="text-sm text-gray-600">제작 툴: {artwork.declared_tool}</p>
            )}
            {artwork?.intent && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{artwork.intent}</p>
            )}
          </div>

          {/* 실시간 경매 패널 */}
          <AuctionClient
            auctionId={id}
            initialAuction={{
              status:        auction.status,
              current_price: Number(auction.current_price),
              start_price:   Number(auction.start_price),
              reserve_price: auction.reserve_price ? Number(auction.reserve_price) : null,
              end_at:        auction.end_at,
              auto_extend_minutes: auction.auto_extend_minutes,
            }}
            initialBids={(bids ?? []).map(b => ({
              id:         b.id,
              amount:     Number(b.amount),
              created_at: b.created_at,
              bidder_id:  b.bidder_id,
            }))}
            userId={user?.id ?? null}
          />
        </div>
      </div>
    </div>
  )
}
