import type { Metadata, Viewport } from 'next'
import { Newsreader, IBM_Plex_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import InstallPrompt from '@/components/InstallPrompt'

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-newsreader',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'Office Mobile — Google Sheet to Mobile Form',
  description: 'Turn any Google Sheet into a mobile-first data entry form. Editorial, quiet, fast.',
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
    description: 'Turn any Google Sheet into a mobile-first data entry form.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#F7F3EE',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexMono.variable}`}>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('om_theme');var theme=t==='dark'?'dark':'light';document.documentElement.setAttribute('data-theme',theme);if(theme==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`}
        </Script>
        {/* The editorial layout renders at the full viewport; individual
            screens manage their own 390px mobile column. */}
        <div className="min-h-[100dvh] relative pb-safe">
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
