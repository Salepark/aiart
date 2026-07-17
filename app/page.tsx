import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-5xl font-bold mb-4 tracking-tight">AI Art Auction</h1>
      <p className="text-gray-500 text-lg mb-8 max-w-md">
        AI 아트의 새로운 가치를 발견하는 경매 플랫폼
      </p>
      <div className="flex gap-4">
        <Link
          href="/gallery"
          className="bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800"
        >
          갤러리 보기
        </Link>
        {user && (
          <Link
            href="/submit"
            className="border border-black px-6 py-3 rounded-xl font-medium hover:bg-gray-50"
          >
            작품 출품
          </Link>
        )}
      </div>
    </main>
  )
}
