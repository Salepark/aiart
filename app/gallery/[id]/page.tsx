import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'

export const revalidate = 60

export default async function ArtworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: artwork } = await supabase
    .from('artworks')
    .select('*, artists(display_name, bio)')
    .eq('id', id)
    .eq('status', 'passed')
    .single()

  if (!artwork) notFound()

  const { data: auctionData } = await supabase
    .from('auctions')
    .select('*')
    .eq('artwork_id', id)
    .in('status', ['scheduled', 'live'])
    .single()

  const { data: urlData } = supabase.storage.from('artworks').getPublicUrl(artwork.image_path)
  const imageUrl = urlData.publicUrl

  const artist = artwork.artists as { display_name: string; bio: string | null } | null

  return (
    <div className="min-h-screen bg-white py-10">
      <div className="max-w-4xl mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-10">
          {/* 이미지 */}
          <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100">
            <Image src={imageUrl} alt={artwork.title} fill className="object-contain" />
          </div>

          {/* 정보 */}
          <div className="space-y-5">
            <h1 className="text-2xl font-bold">{artwork.title}</h1>
            <p className="text-gray-600">작가: {artist?.display_name ?? '-'}</p>
            {artist?.bio && <p className="text-sm text-gray-500">{artist.bio}</p>}

            {artwork.intent && (
              <div>
                <h2 className="font-semibold mb-1">제작 의도</h2>
                <p className="text-gray-700 whitespace-pre-wrap text-sm">{artwork.intent}</p>
              </div>
            )}

            {artwork.declared_tool && (
              <div>
                <h2 className="font-semibold mb-1">제작 툴</h2>
                <p className="text-gray-700 text-sm">{artwork.declared_tool}</p>
              </div>
            )}

            <div className="text-sm text-gray-500">
              해상도: {artwork.actual_width ?? artwork.declared_width} × {artwork.actual_height ?? artwork.declared_height} px
            </div>

            {/* 경매 정보 */}
            {auctionData && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-lg">경매</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    auctionData.status === 'live' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {auctionData.status === 'live' ? '진행 중' : '예정'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">현재가</span>
                  <span className="font-bold text-xl">₩{Number(auctionData.current_price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>시작가</span>
                  <span>₩{Number(auctionData.start_price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>마감</span>
                  <span>{new Date(auctionData.end_at).toLocaleString('ko-KR')}</span>
                </div>
                <Link
                  href={`/auctions/${auctionData.id}`}
                  className="block text-center bg-black text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-800"
                >
                  {auctionData.status === 'live' ? '입찰하러 가기' : '경매 상세 보기'}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
