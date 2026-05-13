"use client";

import { useState } from "react";
import { usePrefs } from "@/lib/usePrefs";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

interface Props {
  onAuthenticated: () => void;
}

type AuthState = "idle" | "loading" | "success" | "error" | "unauthorized";

/**
 * WelcomeScreen — editorial login.
 *
 * The page splits roughly 55/45 by a single horizontal ink rule. The top
 * zone carries the editorial headline, the bottom zone carries the Google
 * sign-in affordance. Desktop shows a paired meta column on the right.
 */
export default function WelcomeScreen({ onAuthenticated }: Props) {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { copy } = usePrefs();

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
      `width=${width},height=${height},left=${left},top=${top},popup=yes`,
    );

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        setAuthState("success");
        window.removeEventListener("message", handleMessage);
        setTimeout(() => onAuthenticated(), 700);
      }
    }
    window.addEventListener("message", handleMessage);

    const interval = setInterval(async () => {
      if (!popup || popup.closed) {
        clearInterval(interval);
        try {
          const res = await fetch(`${API_BASE}/api/auth/status`, { credentials: "include" });
          const data = await res.json();
          if (data.session_key) {
            try {
              window.localStorage.setItem("om_session", data.session_key);
            } catch {}
          }
          if (data.connected) {
            setAuthState("success");
            setTimeout(() => onAuthenticated(), 700);
          } else {
            setAuthState("idle");
          }
        } catch {
          setAuthState("idle");
        }
      }
    }, 500);
  }

  const buttonDisabled = authState === "loading" || authState === "success";

  return (
    <div className="om-welcome" role="main">
      {/* Fixed progress rule at the top of the viewport. */}
      <div className="om-welcome__progress" aria-hidden>
        <span className="om-welcome__progress-fill" style={{ width: "15%" }} />
      </div>

      <div className="om-welcome__stage">
        {/* Mobile-first editorial column (max 390px wide) */}
        <section className="om-welcome__column">
          {/* Top zone — hero. Height is 55% of the column. */}
          <div className="om-welcome__top">
            <p className="om-welcome__kicker">Officemobile · v2</p>
            <h1 className="om-welcome__hero om-display" style={{ whiteSpace: "pre-line" }}>
              {copy.hero_title ? (
                copy.hero_title
              ) : (
                <>
                  Your Spreadsheet.
                  <br />
                  Your <em>Form.</em>
                </>
              )}
            </h1>
            <p className="om-welcome__sub om-meta">
              {copy.hero_sub ?? "// connect a google sheet. collect data. done."}
            </p>
          </div>

          {/* Bottom zone — sign-in affordance. */}
          <div className="om-welcome__bottom">
            <p className="om-label om-welcome__label">Sign in</p>

            {authState === "success" ? (
              <div className="om-welcome__status">
                <span className="om-welcome__check" aria-hidden>✓</span>
                <span>you&apos;re in. loading workspace…</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={buttonDisabled}
                  className="om-welcome__button"
                  aria-label="Continue with Google"
                >
                  {authState === "loading" ? (
                    <>
                      <span className="login-spinner" aria-hidden />
                      <span>Connecting…</span>
                    </>
                  ) : (
                    <>
                      <GoogleMark />
                      <span>Continue with Google</span>
                      <span className="om-welcome__arrow" aria-hidden>→</span>
                    </>
                  )}
                </button>

                {authState === "unauthorized" && (
                  <p className="om-welcome__error" role="alert">
                    ✕ this account doesn&apos;t have access yet.
                  </p>
                )}
                {authState === "error" && errorMessage && (
                  <p className="om-welcome__error" role="alert">✕ {errorMessage}</p>
                )}
              </>
            )}

            <p className="om-welcome__trust om-meta">
              we only read sheets you choose · nothing is stored on our servers
            </p>
          </div>

          {/* Rotated stamp — bottom-right of the column. */}
          <div className="om-welcome__stamp" aria-hidden>
            v2 · oauth · no tracking
          </div>
        </section>

        {/* Desktop-only meta column */}
        <aside className="om-welcome__meta" aria-label="About">
          <p className="om-label">Officemobile · v2</p>
          <h2 className="om-welcome__meta-title om-display">
            A quiet <em>editorial</em> take on mobile data entry.
          </h2>
          <hr className="om-welcome__meta-rule" />
          <p className="om-welcome__meta-body">
            Paste any Google Sheet. Columns become fields. Entries go straight
            back into the sheet. No accounts to manage, no dashboards to tend.
          </p>
          <ul className="om-welcome__meta-list">
            <li>
              <span>01</span>
              <span>Sign in with Google.</span>
            </li>
            <li>
              <span>02</span>
              <span>Paste a sheet URL or build one from scratch.</span>
            </li>
            <li>
              <span>03</span>
              <span>Share the form. Entries land back in your sheet.</span>
            </li>
          </ul>
          <div className="om-welcome__meta-footer">
            <a href="/privacy">Privacy</a>
            <span aria-hidden>·</span>
            <a href="/terms">Terms</a>
            <span aria-hidden>·</span>
            <a href="mailto:aniketmishra492@gmail.com">Help</a>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .om-welcome {
          position: fixed;
          inset: 0;
          background: var(--cream);
          background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(26, 23, 20, 0.012) 2px,
            rgba(26, 23, 20, 0.012) 4px
          );
          overflow: hidden;
          z-index: 10;
        }
        .om-welcome__progress {
          position: relative;
          height: 2px;
          background: var(--rule);
        }
        .om-welcome__progress-fill {
          display: block;
          height: 100%;
          background: var(--ink);
          transition: width 400ms ease-out;
        }
        .om-welcome__stage {
          position: absolute;
          top: 2px;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          align-items: stretch;
          justify-content: flex-start;
        }
        .om-welcome__column {
          position: relative;
          width: 100%;
          max-width: 390px;
          height: 100%;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--rule);
        }
        .om-welcome__top {
          height: 55%;
          padding: 64px 10% 32px 10%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 18px;
          border-bottom: 1px solid var(--ink);
        }
        .om-welcome__kicker {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--stone);
          margin: 0;
        }
        .om-welcome__hero {
          font-size: 42px;
          line-height: 1.08;
          margin: 0;
        }
        .om-welcome__hero em {
          font-style: italic;
          font-weight: 400;
        }
        .om-welcome__sub {
          margin: 0;
          font-size: 12px;
        }
        .om-welcome__bottom {
          height: 45%;
          padding: 40px 10% 32px 10%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 16px;
        }
        .om-welcome__label {
          color: var(--charcoal);
        }
        .om-welcome__button {
          height: 56px;
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background: var(--ink);
          color: var(--on-ink);
          border: 0;
          border-radius: 0;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 500;
          font-size: 13px;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: background-color 200ms ease-out;
        }
        .om-welcome__button:hover:not(:disabled) {
          background: var(--charcoal);
        }
        .om-welcome__button:disabled {
          background: var(--stone);
          cursor: not-allowed;
        }
        .om-welcome__arrow {
          display: inline-block;
          transition: transform 200ms ease-out;
        }
        .om-welcome__button:hover:not(:disabled) .om-welcome__arrow {
          transform: translateX(3px);
        }
        .om-welcome__status {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          height: 56px;
          padding: 0 16px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 13px;
          color: var(--clay);
          background: transparent;
          border: 1px solid var(--clay);
        }
        .om-welcome__check {
          font-family: var(--font-newsreader), Georgia, serif;
          font-size: 22px;
          line-height: 1;
          color: var(--clay);
        }
        .om-welcome__error {
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 11px;
          color: var(--error);
          margin: 0;
          letter-spacing: 0.04em;
          animation: fadeIn 150ms ease-out;
        }
        .om-welcome__trust {
          margin: 4px 0 0 0;
          font-size: 10px;
          letter-spacing: 0.06em;
        }
        .om-welcome__stamp {
          position: absolute;
          right: 14px;
          bottom: 80px;
          font-family: var(--font-plex-mono), ui-monospace, monospace;
          font-weight: 400;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--stone);
          transform: rotate(-90deg);
          transform-origin: right bottom;
          white-space: nowrap;
          pointer-events: none;
        }

        /* Desktop meta column */
        .om-welcome__meta {
          display: none;
        }
        @media (min-width: 960px) {
          .om-welcome__stage {
            padding-left: 8%;
          }
          .om-welcome__column {
            margin-top: 40px;
            margin-bottom: 40px;
            height: calc(100% - 80px);
            border: 1px solid var(--rule);
          }
          .om-welcome__meta {
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 96px 72px;
            max-width: 520px;
            gap: 28px;
          }
          .om-welcome__meta-title {
            font-size: 28px;
            line-height: 1.25;
            margin: 0;
          }
          .om-welcome__meta-title em {
            font-style: italic;
            font-weight: 400;
          }
          .om-welcome__meta-rule {
            width: 64px;
            height: 1px;
            background: var(--rule);
            margin: 0;
            border: 0;
          }
          .om-welcome__meta-body {
            font-family: var(--font-newsreader), Georgia, serif;
            font-weight: 300;
            font-size: 15px;
            line-height: 1.65;
            color: var(--charcoal);
            margin: 0;
            max-width: 440px;
          }
          .om-welcome__meta-list {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          .om-welcome__meta-list li {
            display: grid;
            grid-template-columns: 32px 1fr;
            gap: 14px;
            align-items: baseline;
            font-family: var(--font-plex-mono), ui-monospace, monospace;
            font-weight: 400;
            font-size: 12px;
            color: var(--charcoal);
            letter-spacing: 0.02em;
          }
          .om-welcome__meta-list li > span:first-child {
            color: var(--stone);
            font-weight: 500;
          }
          .om-welcome__meta-footer {
            margin-top: auto;
            display: flex;
            gap: 10px;
            font-family: var(--font-plex-mono), ui-monospace, monospace;
            font-weight: 400;
            font-size: 11px;
            color: var(--stone);
          }
          .om-welcome__meta-footer a {
            color: var(--charcoal);
            text-decoration: none;
          }
          .om-welcome__meta-footer a:hover {
            color: var(--clay);
          }
        }
      `}</style>
    </div>
  );
}

function GoogleMark() {
  // Preserved brand marks — Google requires these colors to identify the
  // sign-in flow. Everything else around it follows the editorial palette.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#FFFFFF"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#FFFFFF"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FFFFFF"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#FFFFFF"/>
    </svg>
  );
}
