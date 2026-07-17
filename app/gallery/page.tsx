import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'

export const revalidate = 60

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: artworks } = await supabase
    .from('artworks')
    .select('id, title, preview_path, image_path, status, sale_type, edition_total, editions_sold, artists(display_name)')
    .in('status', ['passed', 'sold'])
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
          {artworks?.map(aw => {
            const imagePath = (aw.preview_path ?? aw.image_path) as string
            const isSold    = aw.status === 'sold'
            const artist    = (aw.artists as unknown as { display_name: string } | null)?.display_name ?? '-'
            const isNumbered = aw.sale_type === 'numbered'
            return (
              <Link key={aw.id} href={`/gallery/${aw.id}`} className="group block">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <Image
                    src={getPublicUrl(imagePath)}
                    alt={aw.title as string}
                    fill
                    className={`object-cover transition-transform duration-300 ${isSold ? '' : 'group-hover:scale-105'}`}
                  />
                  {isSold && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="bg-white text-black text-xs font-bold px-3 py-1 rounded-full tracking-widest">
                        SOLD
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <p className="font-medium text-sm truncate">{aw.title as string}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-500 truncate">{artist}</p>
                    {isNumbered && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        · {aw.editions_sold as number}/{aw.edition_total as number}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
