import type { Metadata } from 'next'
import './globals.css'
import { Big_Shoulders_Display, Cormorant_Garamond, IBM_Plex_Mono } from 'next/font/google'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { MobileMenuProvider } from '@/components/MobileMenuProvider'

const bigShoulders = Big_Shoulders_Display({
  weight: ['900'],
  subsets: ['latin'],
  variable: '--font-heading',
})

const cormorant = Cormorant_Garamond({
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-display',
})

const ibmMono = IBM_Plex_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Glorioso Finance',
  description: 'Plataforma de gestão financeira do Botafogo de Futebol e Regatas',
  icons: { icon: '/lbotafogo.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${bigShoulders.variable} ${cormorant.variable} ${ibmMono.variable} bg-base text-ink antialiased`}>
        <ThemeProvider>
          <MobileMenuProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 bg-[#F7F6F2]">
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
