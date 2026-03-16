import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'BudgetOKR — Budget vs Razão',
  description: 'Plataforma de comparação orçamentária e métricas departamentais',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 antialiased" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-6 min-w-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
