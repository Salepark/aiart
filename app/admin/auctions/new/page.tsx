'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function NewAuctionForm() {
  const router = useRouter()
  const params = useSearchParams()
  const artworkId = params.get('artwork_id') ?? ''
  const title     = params.get('title') ?? '작품'

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

  const [form, setForm] = useState({
    start_price:         '',
    reserve_price:       '',
    start_at:            toLocal(now),
    end_at:              toLocal(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
    auto_extend_minutes: '5',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/admin/auctions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artwork_id: artworkId,
        start_price: form.start_price,
        reserve_price: form.reserve_price || null,
        start_at: new Date(form.start_at).toISOString(),
        end_at:   new Date(form.end_at).toISOString(),
        auto_extend_minutes: form.auto_extend_minutes,
      }),
    })

    const json = await res.json()
    if (!res.ok) { setError(json.error); setLoading(false); return }
    router.push('/admin/auctions')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow p-8">
        <h1 className="text-xl font-bold mb-1">경매 만들기</h1>
        <p className="text-gray-500 text-sm mb-6">작품: {title}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="시작가 (₩) *" name="start_price" type="number" value={form.start_price} onChange={handleChange} required />
          <Field label="최저낙찰가 (₩, 선택)" name="reserve_price" type="number" value={form.reserve_price} onChange={handleChange} />
          <Field label="경매 시작 *" name="start_at" type="datetime-local" value={form.start_at} onChange={handleChange} required />
          <Field label="경매 종료 *" name="end_at" type="datetime-local" value={form.end_at} onChange={handleChange} required />
          <Field label="자동연장 (분)" name="auto_extend_minutes" type="number" value={form.auto_extend_minutes} onChange={handleChange} />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => router.back()}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">
              취소
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-black text-white rounded-lg py-2 text-sm hover:bg-gray-800 disabled:opacity-50">
              {loading ? '생성 중...' : '경매 생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, name, type, value, onChange, required }: {
  label: string; name: string; type: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
    </div>
  )
}

export default function NewAuctionPage() {
  return (
    <Suspense>
      <NewAuctionForm />
    </Suspense>
  )
}
