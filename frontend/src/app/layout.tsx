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
  applicationName: 'Office Mobile',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192' },
      { url: '/icons/icon-512.png', sizes: '512x512' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Office Mobile',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'Office Mobile — Google Sheet to Mobile Form',
    description: 'Turn any Google Sheet into a mobile-first data entry form.',
    type: 'website',
    siteName: 'Office Mobile',
  },
  other: {
    // Android/Chrome PWA hints
    'mobile-web-app-capable': 'yes',
    'application-name': 'Office Mobile',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  // Light/dark adaptive theme colour so the installed app chrome
  // matches the user's OS preference.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F3EE' },
    { media: '(prefers-color-scheme: dark)', color: '#1B1B1B' },
  ],
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
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker
                  .register('/sw.js', { scope: '/' })
                  .then(function (reg) {
                    // When a new SW is found, ask it to activate immediately
                    // so the user sees fresh assets on the next navigation.
                    reg.addEventListener('updatefound', function () {
                      var sw = reg.installing;
                      if (!sw) return;
                      sw.addEventListener('statechange', function () {
                        if (
                          sw.state === 'installed' &&
                          navigator.serviceWorker.controller
                        ) {
                          sw.postMessage('SKIP_WAITING');
                        }
                      });
                    });
                    // Check for updates whenever the tab regains focus —
                    // keeps long-lived installed PWAs current.
                    document.addEventListener('visibilitychange', function () {
                      if (document.visibilityState === 'visible') {
                        reg.update().catch(function () {});
                      }
                    });
                  })
                  .catch(function () {});
                // Reload once the new SW takes control so the page runs
                // against the refreshed asset graph. Skip if we're in the
                // middle of an OAuth redirect (hash contains session key).
                var refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                  if (refreshing) return;
                  if (window.location.hash && window.location.hash.indexOf('om_session') !== -1) return;
                  refreshing = true;
                  window.location.reload();
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  )
}
