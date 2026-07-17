'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const NEXT_STATUS: Record<string, { label: string; status: string; color: string } | null> = {
  scheduled: { label: '경매 시작', status: 'live',      color: 'bg-green-600 hover:bg-green-700' },
  live:      { label: '경매 종료', status: 'ended',     color: 'bg-red-600 hover:bg-red-700' },
  ended:     null,
  cancelled: null,
}

export default function AuctionStatusButton({
  auctionId,
  currentStatus,
}: {
  auctionId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const next = NEXT_STATUS[currentStatus]
  if (!next) return null

  async function handleClick() {
    setLoading(true)
    const res = await fetch(`/api/admin/auctions/${auctionId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next!.status }),
    })
    if (!res.ok) {
      const j = await res.json()
      alert(j.error)
    } else {
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`text-sm text-white px-3 py-1.5 rounded-lg disabled:opacity-50 ${next.color}`}
    >
      {loading ? '처리 중...' : next.label}
    </button>
  )
}
