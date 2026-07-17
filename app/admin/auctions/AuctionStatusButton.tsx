'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const NEXT_STATUS: Record<string, { label: string; status: string; color: string } | null> = {
  scheduled: { label: '경매 시작', status: 'live',   color: 'bg-green-600 hover:bg-green-700' },
  live:      { label: '경매 종료', status: 'ended',  color: 'bg-red-600 hover:bg-red-700' },
  ended:     null,
  cancelled: null,
}

export default function AuctionStatusButton({
  auctionId,
  currentStatus,
  certificateId,
}: {
  auctionId: string
  currentStatus: string
  certificateId?: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const next = NEXT_STATUS[currentStatus]

  async function handleStatusChange() {
    if (!next) return
    setLoading(true)
    const res = await fetch(`/api/admin/auctions/${auctionId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next.status }),
    })
    if (!res.ok) { const j = await res.json(); alert(j.error) }
    else router.refresh()
    setLoading(false)
  }

  async function handleSettle() {
    if (!confirm('낙찰 정산을 진행합니다. 구매자 인증서가 발급됩니다.')) return
    setLoading(true)
    const res = await fetch(`/api/admin/auctions/${auctionId}/settle`, { method: 'POST' })
    const j = await res.json()
    if (!res.ok) alert(j.error)
    else { alert(`정산 완료! 인증서 ID: ${j.certificate_id}`); router.refresh() }
    setLoading(false)
  }

  // ended + 미정산 → 정산 버튼
  if (currentStatus === 'ended' && !certificateId) {
    return (
      <button
        onClick={handleSettle}
        disabled={loading}
        className="text-sm text-white px-3 py-1.5 rounded-lg disabled:opacity-50 bg-purple-600 hover:bg-purple-700"
      >
        {loading ? '처리 중...' : '낙찰 정산'}
      </button>
    )
  }

  // ended + 정산 완료 → 인증서 링크
  if (currentStatus === 'ended' && certificateId) {
    return (
      <Link
        href={`/certificates/${certificateId}`}
        className="text-sm text-purple-700 underline px-2 py-1.5"
      >
        인증서 보기
      </Link>
    )
  }

  if (!next) return null

  return (
    <button
      onClick={handleStatusChange}
      disabled={loading}
      className={`text-sm text-white px-3 py-1.5 rounded-lg disabled:opacity-50 ${next.color}`}
    >
      {loading ? '처리 중...' : next.label}
    </button>
  )
}
