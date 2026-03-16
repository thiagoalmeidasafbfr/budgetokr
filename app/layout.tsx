import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { DatasetSelector } from '@/components/DatasetSelector'

export const metadata: Metadata = {
  title: 'BudgetOKR — Budget vs Realizado',
  description: 'Plataforma de comparação orçamentária e métricas departamentais',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 text-gray-900 antialiased" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-end gap-3 sticky top-0 z-10">
              <DatasetSelector />
            </header>
            <main className="flex-1 p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
