import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { addBuyerWatermark } from '@/lib/screening/watermark'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: auctionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()

  // 1. 경매 + 작품 조회
  const { data: auction } = await service
    .from('auctions')
    .select('*, artworks(*)')
    .eq('id', auctionId)
    .eq('status', 'ended')
    .single()

  if (!auction) return NextResponse.json({ error: '종료된 경매를 찾을 수 없습니다' }, { status: 404 })

  // 이미 정산됐는지 확인
  const { data: existingCert } = await service
    .from('certificates')
    .select('id')
    .eq('auction_id', auctionId)
    .maybeSingle()

  if (existingCert) return NextResponse.json({ error: '이미 정산된 경매입니다', certificate_id: existingCert.id }, { status: 409 })

  // 2. 최고 입찰자
  const { data: topBid } = await service
    .from('bids')
    .select('*')
    .eq('auction_id', auctionId)
    .order('amount', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!topBid) return NextResponse.json({ error: '입찰 내역이 없습니다' }, { status: 400 })

  const artwork = auction.artworks as Record<string, unknown>
  if (!artwork.original_path) return NextResponse.json({ error: 'original_path가 없습니다. 이전 출품 방식의 작품입니다.' }, { status: 400 })

  const editionNumber = (Number(artwork.editions_sold) || 0) + 1
  const editionTotal  = Number(artwork.edition_total)  || 1
  const issuedAt      = new Date().toISOString()
  const certId        = crypto.randomUUID()
  const watermarkId   = crypto.randomUUID()

  // 3. 원본 파일 다운로드 (originals 비공개 버킷)
  const { data: originalFile, error: dlErr } = await service.storage
    .from('originals')
    .download(artwork.original_path as string)

  if (dlErr || !originalFile) {
    return NextResponse.json({ error: '원본 파일 다운로드 실패: ' + dlErr?.message }, { status: 500 })
  }

  // 4. 구매자 전용 워터마크 삽입
  const originalBuffer    = Buffer.from(await originalFile.arrayBuffer())
  const watermarkedBuffer = await addBuyerWatermark(originalBuffer, {
    certificateId: certId,
    editionNumber,
    editionTotal,
    issuedAt,
  })

  // 5. 구매자 전용 파일 업로드 (originals/buyer/{buyerId}/{certId}.jpg)
  const buyerFilePath = `buyer/${topBid.bidder_id}/${certId}.jpg`
  const { error: upErr } = await service.storage
    .from('originals')
    .upload(buyerFilePath, watermarkedBuffer, { contentType: 'image/jpeg' })

  if (upErr) return NextResponse.json({ error: '파일 업로드 실패: ' + upErr.message }, { status: 500 })

  // 6. 파일 해시 + 플랫폼 서명
  const fileHash = crypto.createHash('sha256').update(watermarkedBuffer).digest('hex')
  const sigPayload = `${certId}:${artwork.id}:${topBid.bidder_id}:${editionNumber}:${issuedAt}`
  const platformSignature = crypto
    .createHmac('sha256', process.env.CERTIFICATE_SECRET ?? 'aiart-default-secret')
    .update(sigPayload)
    .digest('hex')

  // 7. 인증서 DB 저장
  const { error: certErr } = await service.from('certificates').insert({
    id:                 certId,
    artwork_id:         artwork.id as string,
    auction_id:         auctionId,
    edition_number:     editionNumber,
    edition_total:      editionTotal,
    buyer_id:           topBid.bidder_id,
    original_path:      buyerFilePath,
    file_hash:          fileHash,
    watermark_id:       watermarkId,
    issued_at:          issuedAt,
    platform_signature: platformSignature,
  })

  if (certErr) return NextResponse.json({ error: certErr.message }, { status: 500 })

  // 8. 작품 상태 업데이트
  const newEditionsSold = editionNumber
  const isSold =
    (artwork.sale_type as string) === 'exclusive' || newEditionsSold >= editionTotal

  await service.from('artworks').update({
    editions_sold: newEditionsSold,
    status: isSold ? 'sold' : 'passed',
  }).eq('id', artwork.id as string)

  return NextResponse.json({ ok: true, certificate_id: certId })
}
