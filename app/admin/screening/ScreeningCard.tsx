'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Artwork = {
  id: string
  title: string
  image_path: string
  declared_tool: string
  declared_prompt: string
  intent: string
  declared_width: number
  declared_height: number
  actual_width: number | null
  actual_height: number | null
  status: string
  artists: { display_name: string } | null
}

type Verdict = {
  id: string
  layer: string | null
  verdict: string
  reason: string
  axis: string | null
  attributed_to: string | null
  confidence: number | null
  decided_by: string
  created_at: string
}

const verdictStyle: Record<string, string> = {
  pass: 'bg-green-100 text-green-800',
  hold: 'bg-yellow-100 text-yellow-800',
  flag: 'bg-red-100 text-red-800',
}
const decidedByLabel: Record<string, string> = {
  rule: '규칙', agent: 'AI', human: '관리자',
}

export default function ScreeningCard({
  artwork,
  verdicts: initialVerdicts,
}: {
  artwork: Artwork
  verdicts: Verdict[]
}) {
  const router = useRouter()
  const [verdicts, setVerdicts] = useState(initialVerdicts)
  const [reason, setReason]     = useState('')
  const [layer, setLayer]       = useState('L1')
  const [submitting, setSubmitting] = useState(false)
  const [screening, setScreening]   = useState(false)
  const [done, setDone]             = useState(false)

  const supabase = createClient()

  function getImageUrl(path: string) {
    const { data } = supabase.storage.from('artworks').getPublicUrl(path)
    return data.publicUrl
  }

  // AI 자동 심사 실행
  async function handleRunAI() {
    setScreening(true)
    const res = await fetch(`/api/admin/screen/${artwork.id}`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json()
      alert(`심사 오류: ${j.error}`)
    } else {
      router.refresh()
    }
    setScreening(false)
  }

  // 인간 판정 제출
  async function handleVerdict(verdict: 'pass' | 'flag' | 'hold') {
    if (!reason.trim()) { alert('판정 근거를 입력해 주세요.'); return }
    setSubmitting(true)
    const res = await fetch('/api/admin/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artwork_id: artwork.id, verdict, reason, layer }),
    })
    if (res.ok) setDone(true)
    else {
      const j = await res.json()
      alert(j.error)
    }
    setSubmitting(false)
  }

  if (done) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 text-gray-400 text-center">
        판정 완료 — {artwork.title}
      </div>
    )
  }

  const hasAiVerdicts = verdicts.some(v => v.decided_by === 'agent' || v.decided_by === 'rule')
  const latestL4 = verdicts.filter(v => v.layer === 'L4').at(-1)

  return (
    <div className="bg-white rounded-2xl shadow p-6 space-y-5">
      {/* 작품 개요 */}
      <div className="flex gap-6">
        <div className="relative w-44 h-44 flex-shrink-0">
          <Image
            src={getImageUrl(artwork.image_path)}
            alt={artwork.title}
            fill
            className="object-contain rounded-xl"
          />
        </div>
        <div className="flex-1 space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{artwork.title}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              artwork.status === 'screening' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
            }`}>
              {artwork.status === 'screening' ? 'AI 심사 중/완료' : '대기'}
            </span>
          </div>
          <p className="text-gray-500">작가: {artwork.artists?.display_name ?? '-'}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-gray-700 mt-1">
            <span className="font-medium">제작 툴</span><span>{artwork.declared_tool ?? '-'}</span>
            <span className="font-medium">신고 해상도</span>
            <span>{artwork.declared_width} × {artwork.declared_height}</span>
            <span className="font-medium">실측 해상도</span>
            <span className={
              artwork.actual_width !== artwork.declared_width ? 'text-red-600 font-medium' : ''
            }>
              {artwork.actual_width ?? '?'} × {artwork.actual_height ?? '?'}
            </span>
          </div>
          {artwork.declared_prompt && (
            <p className="text-gray-500 text-xs line-clamp-2 mt-1">{artwork.declared_prompt}</p>
          )}
        </div>
      </div>

      {/* AI 심사 결과 */}
      {hasAiVerdicts ? (
        <div className="border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">AI 심사 결과</h3>
            <button
              onClick={handleRunAI}
              disabled={screening}
              className="text-xs text-gray-500 underline disabled:opacity-50"
            >
              {screening ? '실행 중...' : '재실행'}
            </button>
          </div>
          {(['L1', 'L2', 'L3', 'L4'] as const).map(layer => {
            const layerVerdicts = verdicts.filter(v => v.layer === layer)
            if (layerVerdicts.length === 0) return null
            return (
              <div key={layer} className="flex items-start gap-2 text-sm">
                <span className="font-mono font-bold text-gray-400 w-6">{layer}</span>
                <div className="flex-1 space-y-1">
                  {layerVerdicts.map(v => (
                    <div key={v.id} className="flex items-start gap-2">
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${verdictStyle[v.verdict]}`}>
                        {v.verdict.toUpperCase()}
                      </span>
                      <span className="text-gray-600 text-xs">{v.reason}</span>
                      {v.attributed_to && (
                        <span className="text-xs text-gray-400 flex-shrink-0">→ {v.attributed_to}
                          {v.confidence && ` (${Math.round(v.confidence * 100)}%)`}
                        </span>
                      )}
                      <span className="text-xs text-gray-300 flex-shrink-0">{decidedByLabel[v.decided_by]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {latestL4 && (
            <div className={`mt-2 p-2 rounded-lg text-sm font-medium ${verdictStyle[latestL4.verdict]}`}>
              종합 판정: {latestL4.verdict.toUpperCase()} — {latestL4.reason}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 border rounded-xl p-4">
          <p className="text-sm text-gray-500 flex-1">AI 자동 심사가 아직 실행되지 않았습니다.</p>
          <button
            onClick={handleRunAI}
            disabled={screening}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex-shrink-0"
          >
            {screening ? '실행 중...' : 'AI 심사 실행'}
          </button>
        </div>
      )}

      {/* 인간 최종 판정 */}
      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">관리자 최종 판정</h3>
        <div className="flex gap-3 items-center">
          <label className="text-sm text-gray-600">레이어</label>
          <select
            value={layer}
            onChange={e => setLayer(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {['L1', 'L2', 'L3', 'L4'].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <textarea
          placeholder="판정 근거 (필수)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
        />
        <div className="flex gap-3">
          <button onClick={() => handleVerdict('pass')} disabled={submitting}
            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
            PASS
          </button>
          <button onClick={() => handleVerdict('hold')} disabled={submitting}
            className="flex-1 bg-yellow-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-yellow-600 disabled:opacity-50">
            HOLD
          </button>
          <button onClick={() => handleVerdict('flag')} disabled={submitting}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            FLAG
          </button>
        </div>
      </div>
    </div>
  )
}
