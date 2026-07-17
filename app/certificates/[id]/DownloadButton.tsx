'use client'

import { useState } from 'react'

export default function DownloadButton({ certificateId }: { certificateId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleDownload() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/certificates/${certificateId}/download`)
      const json = await res.json()
      if (!res.ok) { setError(json.error); return }
      window.open(json.url, '_blank')
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="w-full bg-black text-white rounded-xl py-3 font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {loading ? '다운로드 링크 생성 중...' : '원본 파일 다운로드'}
      </button>
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}
      <p className="text-xs text-center text-gray-400">링크는 1시간 후 만료됩니다</p>
    </div>
  )
}
