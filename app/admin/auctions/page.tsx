export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AuctionStatusButton from './AuctionStatusButton'

export default async function AdminAuctionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') redirect('/')

  const service = (await import('@/lib/supabase/service')).createServiceClient()

  // 경매가 없는 passed 작품
  const { data: artworksWithoutAuction } = await service
    .from('artworks')
    .select('id, title, artists(display_name)')
    .eq('status', 'passed')
    .is('auctions', null)  // left-join 대신 not exists 처리는 서버에서

  // auctions에 있는 artwork_id 조회
  const { data: auctionArtworkIds } = await service
    .from('auctions')
    .select('artwork_id')

  const usedIds = new Set((auctionArtworkIds ?? []).map((a: { artwork_id: string }) => a.artwork_id))
  const eligibleArtworks = (artworksWithoutAuction ?? []).filter(
    (aw: { id: string }) => !usedIds.has(aw.id)
  )

  // 전체 경매 목록
  const { data: auctions } = await service
    .from('auctions')
    .select('*, artworks(title, artists(display_name))')
    .order('created_at', { ascending: false })

  const statusLabel: Record<string, string> = {
    scheduled: '예정',
    live: '진행 중',
    ended: '종료',
    cancelled: '취소',
  }
  const statusColor: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    live: 'bg-green-100 text-green-800',
    ended: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4 space-y-10">

        {/* 경매 생성 가능 작품 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">경매 관리</h1>
          </div>

          {eligibleArtworks.length > 0 && (
            <div className="bg-white rounded-2xl shadow p-6">
              <h2 className="font-semibold text-lg mb-3">경매 미등록 작품 (passed)</h2>
              <div className="space-y-2">
                {eligibleArtworks.map((aw: { id: string; title: string; artists: unknown }) => {
                  const artist = (Array.isArray(aw.artists) ? aw.artists[0] : aw.artists) as { display_name: string } | null
                  return (
                    <div key={aw.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <span className="font-medium">{aw.title}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          — {artist?.display_name ?? '-'}
                        </span>
                      </div>
                      <Link
                        href={`/admin/auctions/new?artwork_id=${aw.id}&title=${encodeURIComponent(aw.title)}`}
                        className="bg-black text-white text-sm px-4 py-1.5 rounded-lg hover:bg-gray-800"
                      >
                        경매 만들기
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* 경매 목록 */}
        <section>
          <h2 className="text-xl font-bold mb-4">전체 경매</h2>
          {(!auctions || auctions.length === 0) && (
            <p className="text-gray-500">등록된 경매가 없습니다.</p>
          )}
          <div className="space-y-4">
            {auctions?.map((auction) => {
              const artwork = auction.artworks as { title: string; artists: { display_name: string } | null } | null
              return (
                <div key={auction.id} className="bg-white rounded-2xl shadow p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[auction.status]}`}>
                          {statusLabel[auction.status]}
                        </span>
                        <span className="font-semibold">{artwork?.title ?? '-'}</span>
                        <span className="text-sm text-gray-500">
                          — {(artwork?.artists as { display_name: string } | null)?.display_name ?? '-'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 grid grid-cols-3 gap-x-6">
                        <span>시작가: ₩{Number(auction.start_price).toLocaleString()}</span>
                        <span>현재가: <strong>₩{Number(auction.current_price).toLocaleString()}</strong></span>
                        {auction.reserve_price && (
                          <span>최저가: ₩{Number(auction.reserve_price).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(auction.start_at).toLocaleString('ko-KR')} ~{' '}
                        {new Date(auction.end_at).toLocaleString('ko-KR')}
                        {' '}(자동연장 {auction.auto_extend_minutes}분)
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Link
                        href={`/auctions/${auction.id}`}
                        className="text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                      >
                        보기
                      </Link>
                      <AuctionStatusButton auctionId={auction.id} currentStatus={auction.status} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
