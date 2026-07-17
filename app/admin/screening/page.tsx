export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScreeningCard from './ScreeningCard'

export default async function ScreeningPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const role = (user.app_metadata as Record<string, string>)?.role
  if (role !== 'admin') redirect('/')

  const service = (await import('@/lib/supabase/service')).createServiceClient()

  // submitted + screening 상태 모두 표시
  const { data: artworks } = await service
    .from('artworks')
    .select('*, artists(display_name)')
    .in('status', ['submitted', 'screening'])
    .order('created_at', { ascending: true })

  // 각 작품의 screening_verdicts 조회
  const artworkIds = (artworks ?? []).map((a: { id: string }) => a.id)
  const { data: allVerdicts } = artworkIds.length
    ? await service
        .from('screening_verdicts')
        .select('*')
        .in('artwork_id', artworkIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const verdictsByArtwork = (allVerdicts ?? []).reduce(
    (acc: Record<string, unknown[]>, v: { artwork_id: string }) => {
      if (!acc[v.artwork_id]) acc[v.artwork_id] = []
      acc[v.artwork_id].push(v)
      return acc
    },
    {}
  )

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-6">심사 대기 목록</h1>
        {(!artworks || artworks.length === 0) && (
          <p className="text-gray-500">심사 대기 작품이 없습니다.</p>
        )}
        <div className="space-y-6">
          {artworks?.map(aw => (
            <ScreeningCard
              key={aw.id}
              artwork={aw}
              verdicts={(verdictsByArtwork[aw.id] ?? []) as Parameters<typeof ScreeningCard>[0]['verdicts']}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
