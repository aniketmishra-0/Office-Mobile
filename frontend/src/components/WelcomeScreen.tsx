"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

interface Props {
  onAuthenticated: () => void;
}

type AuthState = "idle" | "loading" | "success" | "error" | "unauthorized";

export default function WelcomeScreen({ onAuthenticated }: Props) {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSignIn() {
    setAuthState("loading");
    setErrorMessage(null);

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      `${API_BASE}/api/auth/google/start`,
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );

    // Listen for success message from popup
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        setAuthState("success");
        window.removeEventListener("message", handleMessage);
        setTimeout(() => {
          onAuthenticated();
        }, 1000);
      }
    }
    window.addEventListener("message", handleMessage);

    // Poll for popup close
    const interval = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(interval);
        // Check if auth succeeded
        try {
          const res = await fetch(`${API_BASE}/api/auth/status`, {
            credentials: "include",
          });
          const data = await res.json();
          if (data.connected) {
            setAuthState("success");
            setTimeout(() => {
              onAuthenticated();
            }, 1000);
          } else {
            setAuthState("idle");
          }
        } catch {
          setAuthState("idle");
        }
      }
    }, 500);
  }

  return (
    <div className="login-screen">
      {/* Background texture */}
      <div className="login-bg" aria-hidden="true" />

      {/* Main content */}
      <main className="login-content" role="main">
        {/* Logo */}
        <header className="login-header flex justify-center mb-4">
          <div className="login-logo text-center">
            <Logo size="lg" showText={true} stacked={true} />
          </div>
        </header>

        {/* Steps preview */}
        <div className="login-steps">
          <div className="login-step">
            <span className="login-step-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
            </span>
            <span>Paste a sheet</span>
          </div>
          <div className="login-step-divider" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
          <div className="login-step">
            <span className="login-step-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
            <span>Customize</span>
          </div>
          <div className="login-step-divider" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
          <div className="login-step">
            <span className="login-step-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </span>
            <span>Share</span>
          </div>
        </div>

        {/* Hero section */}
        <div className="login-hero">
          <h1 className="login-headline">
            Your spreadsheet,
            <br />
            now a form.
          </h1>
          <p className="login-subheadline">
            Connect your Google account to turn any sheet into a mobile-friendly form in seconds.
          </p>
        </div>

        {/* CTA area */}
        <div className="login-cta-area">
          {authState === "success" ? (
            <div className="login-success">
              <div className="login-success-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span>You&apos;re in. Setting things up…</span>
            </div>
          ) : authState === "unauthorized" ? (
            <div className="login-error-area">
              <button
                type="button"
                onClick={handleSignIn}
                className="login-google-btn"
                aria-label="Continue with Google"
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>
              <p className="login-error-message">
                This account doesn&apos;t have access yet. Try a different Google account or contact support.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={authState === "loading"}
                className="login-google-btn"
                aria-label="Continue with Google"
              >
                {authState === "loading" ? (
                  <>
                    <div className="login-spinner" />
                    <span>Connecting…</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
              {authState === "error" && errorMessage && (
                <p className="login-error-message">{errorMessage}</p>
              )}
            </>
          )}
        </div>

        {/* Trust text */}
        <p className="login-trust">
          We only access spreadsheets you choose.
          <br />
          No data is stored on our servers.
        </p>
      </main>

      {/* Footer */}
      <footer className="login-footer flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <span>Made with ❤️ by Aniket</span>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          <a href="/privacy" className="hover:text-gray-600 transition-colors">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/terms" className="hover:text-gray-600 transition-colors">Terms</a>
          <span aria-hidden="true">·</span>
          <a href="mailto:aniketmishra492@gmail.com" className="hover:text-gray-600 transition-colors">Help</a>
        </div>
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}
