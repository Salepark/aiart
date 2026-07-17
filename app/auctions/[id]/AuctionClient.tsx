'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type AuctionState = {
  status: string
  current_price: number
  start_price: number
  reserve_price: number | null
  end_at: string
  auto_extend_minutes: number
}

type Bid = {
  id: string
  amount: number
  created_at: string
  bidder_id: string
}

function useCountdown(endAt: string) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(endAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('종료'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${h > 0 ? `${h}시간 ` : ''}${m}분 ${s}초`)
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [endAt])

  return timeLeft
}

export default function AuctionClient({
  auctionId,
  initialAuction,
  initialBids,
  userId,
}: {
  auctionId: string
  initialAuction: AuctionState
  initialBids: Bid[]
  userId: string | null
}) {
  const [auction, setAuction] = useState(initialAuction)
  const [bids, setBids]       = useState(initialBids)
  const [bidAmount, setBidAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const timeLeft = useCountdown(auction.end_at)

  // Supabase Realtime 구독
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`auction:${auctionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` },
        (payload) => {
          const n = payload.new as Record<string, unknown>
          setAuction(prev => ({
            ...prev,
            status:        n.status as string,
            current_price: Number(n.current_price),
            end_at:        n.end_at as string,
          }))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` },
        (payload) => {
          const b = payload.new as Record<string, unknown>
          setBids(prev => [
            {
              id:         b.id as string,
              amount:     Number(b.amount),
              created_at: b.created_at as string,
              bidder_id:  b.bidder_id as string,
            },
            ...prev.slice(0, 19),
          ])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [auctionId])

  const handleBid = useCallback(async () => {
    if (!bidAmount) return
    setLoading(true)
    setMessage(null)

    const res = await fetch('/api/bids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auction_id: auctionId, amount: Number(bidAmount) }),
    })
    const json = await res.json()

    if (!res.ok) {
      setMessage({ type: 'err', text: json.error ?? '오류 발생' })
    } else {
      setMessage({ type: 'ok', text: `₩${Number(bidAmount).toLocaleString()} 입찰 완료!` })
      setBidAmount('')
    }
    setLoading(false)
  }, [auctionId, bidAmount])

  const isLive   = auction.status === 'live'
  const isEnded  = auction.status === 'ended' || auction.status === 'cancelled'
  const minBid   = auction.current_price + 1

  const statusBadge: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-800',
    live:      'bg-green-100 text-green-800',
    ended:     'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  }
  const statusLabel: Record<string, string> = {
    scheduled: '경매 예정',
    live:      '진행 중',
    ended:     '종료',
    cancelled: '취소',
  }

  return (
    <div className="space-y-6">
      {/* 상태 + 카운트다운 */}
      <div className="bg-gray-50 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge[auction.status]}`}>
            {statusLabel[auction.status]}
          </span>
          {isLive && (
            <span className="text-sm text-gray-500">마감까지 <strong>{timeLeft}</strong></span>
          )}
        </div>

        <div>
          <p className="text-sm text-gray-500">현재가</p>
          <p className="text-4xl font-bold">₩{auction.current_price.toLocaleString()}</p>
          <p className="text-sm text-gray-400 mt-1">
            시작가 ₩{auction.start_price.toLocaleString()}
            {auction.reserve_price && ` · 최저낙찰가 ₩${auction.reserve_price.toLocaleString()}`}
          </p>
        </div>

        <p className="text-xs text-gray-400">
          마감: {new Date(auction.end_at).toLocaleString('ko-KR')}
          {isLive && ` · 마감 임박 입찰 시 ${auction.auto_extend_minutes}분 자동 연장`}
        </p>
      </div>

      {/* 입찰 폼 */}
      {isLive && (
        userId ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₩</span>
                <input
                  type="number"
                  min={minBid}
                  step={1000}
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={`최소 ₩${minBid.toLocaleString()}`}
                  className="w-full pl-7 pr-3 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black text-sm"
                />
              </div>
              <button
                onClick={handleBid}
                disabled={loading || !bidAmount || Number(bidAmount) <= auction.current_price}
                className="bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 disabled:opacity-40 text-sm whitespace-nowrap"
              >
                {loading ? '처리 중...' : '입찰하기'}
              </button>
            </div>
            {message && (
              <p className={`text-sm ${message.type === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                {message.text}
              </p>
            )}
          </div>
        ) : (
          <a href="/auth/login"
            className="block text-center border border-black rounded-xl py-3 text-sm font-medium hover:bg-gray-50">
            로그인 후 입찰
          </a>
        )
      )}

      {isEnded && (
        <div className="text-center text-gray-500 py-4 border rounded-xl">
          {auction.status === 'ended' ? '경매가 종료되었습니다.' : '취소된 경매입니다.'}
        </div>
      )}

      {/* 입찰 내역 */}
      <div>
        <h3 className="font-semibold mb-3">입찰 내역 ({bids.length}건)</h3>
        {bids.length === 0 ? (
          <p className="text-gray-400 text-sm">아직 입찰이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {bids.map((bid, i) => (
              <div
                key={bid.id}
                className={`flex justify-between items-center py-2 px-3 rounded-lg text-sm ${
                  i === 0 ? 'bg-green-50 font-semibold' : 'bg-gray-50'
                }`}
              >
                <span className="text-gray-500">
                  {bid.bidder_id === userId ? '나' : `입찰자`}
                  {i === 0 && <span className="ml-1 text-green-700">· 최고가</span>}
                </span>
                <div className="text-right">
                  <span>₩{bid.amount.toLocaleString()}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {new Date(bid.created_at).toLocaleTimeString('ko-KR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
