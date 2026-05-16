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
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-icon.svg', type: 'image/svg+xml' },
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
    { media: '(prefers-color-scheme: light)', color: '#EDEAE5' },
    { media: '(prefers-color-scheme: dark)', color: '#1B1B1B' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexMono.variable}`}>
      <head>
        {/* Solid cream startup images — replaces native PWA splash icon
            so the animated React SplashScreen shows immediately */}
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup-small.png"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        <link rel="apple-touch-startup-image"
          href="/icons/startup-small.png"
          media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('om_theme');var theme=t==='dark'?'dark':'light';document.documentElement.setAttribute('data-theme',theme);if(theme==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})()`}
        </Script>
        <Script id="display-init" strategy="beforeInteractive">
          {`(function(){try{var raw=localStorage.getItem('om_display');if(!raw)return;var d=JSON.parse(raw);var r=document.documentElement.style;var fm={'system':'system-ui,-apple-system,sans-serif','newsreader':'var(--font-newsreader),Georgia,serif','plex-mono':'var(--font-plex-mono),ui-monospace,monospace','inter':"'Inter',system-ui,sans-serif",'georgia':"Georgia,'Times New Roman',serif",'merriweather':"'Merriweather',Georgia,serif"};var fs={'xs':'12px','sm':'13px','md':'15px','lg':'17px','xl':'19px'};var lh={'compact':'1.35','normal':'1.55','relaxed':'1.75'};var br={'none':'0px','sm':'4px','md':'8px','lg':'14px'};if(d.font_family&&fm[d.font_family])r.setProperty('--user-font-family',fm[d.font_family]);if(d.font_size&&fs[d.font_size])r.setProperty('--user-font-size',fs[d.font_size]);if(d.line_height&&lh[d.line_height])r.setProperty('--user-line-height',lh[d.line_height]);if(d.border_radius&&br[d.border_radius])r.setProperty('--user-border-radius',br[d.border_radius]);var isDefault=(d.font_family||'system')==='system'&&(d.font_size||'md')==='md'&&(d.line_height||'normal')==='normal'&&(d.border_radius||'md')==='md';if(!isDefault)document.documentElement.setAttribute('data-display','custom')}catch(e){}})()`}
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
