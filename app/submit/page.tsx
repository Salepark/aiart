'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function SubmitPage() {
  const router  = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError]     = useState<string | null>(null)

  const [form, setForm] = useState({
    title:           '',
    declared_tool:   '',
    declared_prompt: '',
    intent:          '',
    declared_width:  '',
    declared_height: '',
    sale_type:       'exclusive',
    edition_total:   '1',
    license_scope:   '',
    asking_price:    '',
  })

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setPreview(URL.createObjectURL(f))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('이미지를 선택해 주세요.'); return }
    if (file.size > 200 * 1024 * 1024) { setError('파일 크기는 200MB 이하여야 합니다.'); return }

    setLoading(true)

    try {
      // 1. 서명 업로드 URL 발급
      setProgress('업로드 준비 중...')
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const prepRes  = await fetch('/api/artworks/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ext }),
      })
      const prepJson = await prepRes.json()
      if (!prepRes.ok) { setError(prepJson.error ?? '준비 실패'); return }

      const { originalSignedUrl, previewSignedUrl, originalPath, previewPath } = prepJson

      // 2. 파일 버퍼 읽기 + SHA-256 계산 (병렬)
      setProgress('파일 분석 중...')
      const buffer = await file.arrayBuffer()
      const file_hash = await computeFileHash(buffer)

      // 3. 원본 → originals 버킷 직접 업로드
      setProgress('원본 업로드 중... (파일 크기에 따라 시간이 걸릴 수 있습니다)')
      const origUpload = await fetch(originalSignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!origUpload.ok) { setError('원본 업로드 실패. 다시 시도해 주세요.'); return }

      // 4. 미리보기 → artworks 버킷 직접 업로드 (워터마크는 서버 파이프라인이 나중에 적용)
      setProgress('미리보기 업로드 중...')
      const prevUpload = await fetch(previewSignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!prevUpload.ok) { setError('미리보기 업로드 실패. 다시 시도해 주세요.'); return }

      // 5. 메타데이터만 API로 전송 (파일 없음 → 빠름)
      setProgress('출품 정보 등록 중...')
      const res  = await fetch('/api/artworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalPath,
          previewPath,
          file_hash,
          title:           form.title,
          declared_tool:   form.declared_tool,
          declared_prompt: form.declared_prompt,
          intent:          form.intent,
          declared_width:  form.declared_width,
          declared_height: form.declared_height,
          sale_type:       form.sale_type,
          edition_total:   form.edition_total,
          license_scope:   form.license_scope || null,
          asking_price:    form.asking_price || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? '등록 실패'); return }

      setProgress('완료!')
      router.push('/')
    } catch (err) {
      setError('오류가 발생했습니다: ' + (err as Error).message)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  const isNumbered = form.sale_type === 'numbered'

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow p-8">
        <h1 className="text-2xl font-bold mb-6">작품 출품</h1>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이미지 *</label>
            <p className="text-xs text-gray-400 mb-2">원본은 비공개 보관되고, 워터마크 미리보기가 자동 생성됩니다. (최대 200MB)</p>
            <input
              type="file" accept="image/*" ref={fileRef} onChange={handleFile}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-black file:text-white hover:file:bg-gray-800"
            />
            {preview && (
              <div className="mt-3 relative w-full h-64">
                <Image src={preview} alt="미리보기" fill className="object-contain rounded-lg" />
              </div>
            )}
          </div>

          <Field label="제목 *" name="title" value={form.title} onChange={handleChange} required />
          <Field label="제작 툴 *" name="declared_tool" value={form.declared_tool} onChange={handleChange} required placeholder="예: Midjourney v6, ComfyUI + SDXL" />
          <TextArea label="사용한 프롬프트 (개략)" name="declared_prompt" value={form.declared_prompt} onChange={handleChange} />
          <TextArea label="제작 의도 *" name="intent" value={form.intent} onChange={handleChange} required />

          <div className="grid grid-cols-2 gap-4">
            <Field label="신고 가로(px) *" name="declared_width"  value={form.declared_width}  onChange={handleChange} type="number" required />
            <Field label="신고 세로(px) *" name="declared_height" value={form.declared_height} onChange={handleChange} type="number" required />
          </div>

          {/* 판매 유형 */}
          <div className="border rounded-xl p-4 space-y-4 bg-gray-50">
            <h2 className="font-semibold text-sm">판매 유형 *</h2>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sale_type" value="exclusive" checked={form.sale_type === 'exclusive'} onChange={handleChange} />
                <span className="text-sm"><span className="font-medium">Exclusive</span><span className="text-gray-500 ml-1">— 단독 1점 판매</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="sale_type" value="numbered" checked={form.sale_type === 'numbered'} onChange={handleChange} />
                <span className="text-sm"><span className="font-medium">Numbered</span><span className="text-gray-500 ml-1">— 에디션 복수 판매</span></span>
              </label>
            </div>
            {isNumbered && (
              <Field label="에디션 총 수량 *" name="edition_total" value={form.edition_total} onChange={handleChange} type="number" required />
            )}
            <TextArea label="라이선스 범위" name="license_scope" value={form.license_scope} onChange={handleChange} />
            <Field label="희망 시작가 (₩, 참고용)" name="asking_price" value={form.asking_price} onChange={handleChange} type="number" />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full bg-black text-white rounded-lg py-3 font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? progress || '처리 중...' : '출품하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', required, placeholder }: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange}
        required={required} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
      />
    </div>
  )
}

function TextArea({ label, name, value, onChange, required }: {
  label: string; name: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea name={name} value={value} onChange={onChange} required={required} rows={3}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black resize-none"
      />
    </div>
  )
}
