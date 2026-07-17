import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = (user?.app_metadata as Record<string, string> | undefined)?.role === 'admin'

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">aiart.bid</Link>
        <div className="flex gap-4 text-sm items-center">
          <Link href="/gallery" className="hover:underline">갤러리</Link>
          {user ? (
            <>
              <Link href="/submit" className="hover:underline">출품하기</Link>
              {isAdmin && (
                <>
                  <Link href="/admin/screening" className="hover:underline text-gray-400">심사</Link>
                  <Link href="/admin/auctions" className="hover:underline text-gray-400">경매관리</Link>
                </>
              )}
              <form action="/auth/signout" method="post">
                <button className="hover:underline">로그아웃</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="hover:underline">로그인</Link>
              <Link href="/auth/signup" className="bg-black text-white px-3 py-1 rounded-lg hover:bg-gray-800">
                회원가입
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-5xl font-bold mb-4 tracking-tight">AI Art Auction</h1>
        <p className="text-gray-500 text-lg mb-8 max-w-md">
          AI 아트의 새로운 가치를 발견하는 경매 플랫폼
        </p>
        <div className="flex gap-4">
          <Link href="/gallery" className="bg-black text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800">
            갤러리 보기
          </Link>
          {user && (
            <Link href="/submit" className="border border-black px-6 py-3 rounded-xl font-medium hover:bg-gray-50">
              작품 출품
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
