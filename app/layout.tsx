import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { MobileMenuProvider } from '@/components/MobileMenuProvider'

export const metadata: Metadata = {
  title: 'Glorioso Finance',
  description: 'Plataforma de gestão financeira do Botafogo de Futebol e Regatas',
  icons: { icon: '/lbotafogo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 antialiased" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <ThemeProvider>
          <MobileMenuProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                <TopBar />
                <main className="flex-1 p-3 md:p-6 min-w-0">
                  {children}
                </main>
              </div>
            </div>
          </MobileMenuProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
