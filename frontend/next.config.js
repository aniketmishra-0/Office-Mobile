/** @type {import('next').NextConfig} */

// Derive the API origin from the public env so connect-src can be tightened
// without blocking local development against http://localhost:8000.
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
let apiOrigin = "";
try {
  apiOrigin = apiUrl ? new URL(apiUrl).origin : "";
} catch {
  apiOrigin = "";
}

const connectSrc = [
  "'self'",
  apiOrigin,
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
]
  .filter(Boolean)
  .join(" ");

// Relaxed inline script/style to avoid breaking Next's runtime injection.
// Tighten with nonces once we migrate off inline styles in components.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
