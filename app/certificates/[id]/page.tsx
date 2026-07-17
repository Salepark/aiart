export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import DownloadButton from './DownloadButton'

export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const service = createServiceClient()

  const { data: cert } = await service
    .from('certificates')
    .select('*, artworks(title, preview_path, image_path, sale_type, artists(display_name)), auctions(end_at, current_price)')
    .eq('id', id)
    .maybeSingle()

  if (!cert) notFound()

  const isAdmin = (user?.app_metadata as Record<string, string> | undefined)?.role === 'admin'
  if (!user || (user.id !== cert.buyer_id && !isAdmin)) notFound()

  const artwork = cert.artworks as {
    title: string; preview_path: string | null; image_path: string | null;
    sale_type: string; artists: { display_name: string } | null
  } | null
  const auction = cert.auctions as { end_at: string; current_price: number } | null

  const imagePath = artwork?.preview_path ?? artwork?.image_path ?? ''
  const { data: urlData } = service.storage.from('artworks').getPublicUrl(imagePath)

  const isBuyer = user?.id === cert.buyer_id

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">

          {/* 헤더 */}
          <div className="bg-black text-white px-8 py-6">
            <p className="text-xs tracking-[0.2em] uppercase text-gray-400 mb-1">
              Certificate of Authenticity
            </p>
            <p className="text-2xl font-bold tracking-tight">aiart.so</p>
          </div>

          {/* 미리보기 이미지 */}
          {imagePath && (
            <div className="relative w-full aspect-video bg-gray-100">
              <Image src={urlData.publicUrl} alt={artwork?.title ?? ''} fill className="object-contain" />
            </div>
          )}

          {/* 인증서 정보 */}
          <div className="px-8 py-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold">{artwork?.title ?? '-'}</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                {(artwork?.artists as { display_name: string } | null)?.display_name ?? '-'}
              </p>
            </div>

            <div className="divide-y border rounded-xl overflow-hidden text-sm">
              <Row label="인증서 번호" value={cert.id} mono />
              <Row label="에디션" value={`${cert.edition_number} / ${cert.edition_total}`} />
              <Row
                label="판매 유형"
                value={artwork?.sale_type === 'exclusive' ? '단독 판매 (Exclusive)' : '넘버드 에디션 (Numbered)'}
              />
              <Row
                label="낙찰가"
                value={auction ? `₩${Number(auction.current_price).toLocaleString()}` : '-'}
              />
              <Row
                label="낙찰일"
                value={auction ? new Date(auction.end_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
              />
              <Row
                label="발급일"
                value={new Date(cert.issued_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              />
              <Row label="워터마크 ID" value={cert.watermark_id ?? '-'} mono />
              <Row
                label="파일 해시 (SHA-256)"
                value={cert.file_hash ? cert.file_hash.slice(0, 32) + '…' : '-'}
                mono
              />
            </div>

            {/* 플랫폼 서명 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-1">
              <p className="text-xs font-semibold text-gray-500 tracking-wide uppercase">Platform Signature</p>
              <p className="text-xs font-mono text-gray-700 break-all leading-relaxed">
                {cert.platform_signature ?? '-'}
              </p>
            </div>

            {/* 다운로드 (낙찰자 본인만) */}
            {isBuyer && <DownloadButton certificateId={cert.id} />}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          이 인증서는 aiart.so 플랫폼에서 발급된 디지털 소유권 증명서입니다.
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 px-4 py-3">
      <span className="text-gray-400 w-36 flex-shrink-0">{label}</span>
      <span className={`flex-1 text-right break-all ${mono ? 'font-mono text-xs text-gray-600' : 'font-medium'}`}>
        {value}
      </span>
    </div>
  )
}
