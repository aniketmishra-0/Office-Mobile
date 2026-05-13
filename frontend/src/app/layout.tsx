import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Office Mobile — Google Sheet to Mobile Form',
  description: 'Turn any Google Sheet into a beautiful mobile data entry form. Fast and free.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Office Mobile',
  },
  openGraph: {
    title: 'Office Mobile — Google Sheet to Mobile Form',
    description: 'Turn any Google Sheet into a beautiful mobile data entry form.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <div className="max-w-[480px] mx-auto min-h-screen relative bg-white shadow-[0_0_40px_rgba(0,0,0,0.03)]">
          {children}
          <InstallPrompt />
        </div>
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js') }) }`}
        </Script>
      </body>
    </html>
  )
}
