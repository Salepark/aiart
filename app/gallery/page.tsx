import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 60

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: artworks } = await supabase
    .from('artworks')
    .select('id, title, image_path, artists(display_name)')
    .eq('status', 'passed')
    .order('created_at', { ascending: false })

  function getPublicUrl(path: string) {
    const { data } = supabase.storage.from('artworks').getPublicUrl(path)
    return data.publicUrl
  }

  return (
    <div className="min-h-screen bg-white py-10">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">갤러리</h1>
        {(!artworks || artworks.length === 0) && (
          <p className="text-gray-500">아직 공개된 작품이 없습니다.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {artworks?.map(aw => (
            <Link key={aw.id} href={`/gallery/${aw.id}`} className="group block">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <Image
                  src={getPublicUrl(aw.image_path)}
                  alt={aw.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="mt-2">
                <p className="font-medium text-sm truncate">{aw.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {(aw.artists as unknown as { display_name: string } | null)?.display_name ?? '-'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
