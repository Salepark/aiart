import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = (user?.app_metadata as Record<string, string> | undefined)?.role === 'admin'

  return (
    <nav className="border-b bg-white px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-bold tracking-tight">
        aiart.bid
      </Link>
      <div className="flex gap-4 text-sm items-center">
        {user ? (
          <>
            <Link href="/gallery" className="hover:underline">갤러리</Link>
            <Link href="/submit" className="hover:underline">출품하기</Link>
            {isAdmin && (
              <Link href="/admin/screening" className="hover:underline text-gray-400">
                관리자 심사
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button type="submit" className="hover:underline">로그아웃</button>
            </form>
          </>
        ) : (
          <>
            <Link href="/auth/login" className="hover:underline">로그인</Link>
            <Link
              href="/auth/signup"
              className="bg-black text-white px-3 py-1 rounded-lg hover:bg-gray-800"
            >
              회원가입
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
