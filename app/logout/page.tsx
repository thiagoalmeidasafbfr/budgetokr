'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      router.push('/login')
      router.refresh()
    })
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-400">Saindo...</p>
    </div>
  )
}
