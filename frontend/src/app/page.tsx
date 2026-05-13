"use client";

import { useEffect, useState } from "react";
import WelcomeScreen from "@/components/WelcomeScreen";
import Dashboard from "@/components/Dashboard";
import LoadingOverlay from "@/components/LoadingOverlay";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export default function HomePage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  async function checkStatus() {
    try {
      // Send the stored session key as a header fallback. iOS Safari is
      // strict about third-party cookies and occasionally drops the session
      // cookie on back/forward navigation, which would otherwise flip us to
      // the logged-out WelcomeScreen. The header keeps auth sticky.
      const headers: Record<string, string> = {};
      try {
        const sessionKey = window.localStorage.getItem("om_session");
        if (sessionKey) headers["X-Session-Key"] = sessionKey;
      } catch {}

      const res = await fetch(`${API_BASE}/api/auth/status`, {
        credentials: "include",
        headers,
      });
      const data = await res.json();
      if (data.session_key) {
        try {
          window.localStorage.setItem("om_session", data.session_key);
        } catch {}
      }
      setConnected(Boolean(data.connected));
    } catch {
      // Keep the previous state on network error so a flaky connection
      // does not log the user out. Only set to false on an explicit
      // backend response that says we're not connected.
      setConnected((prev) => (prev === null ? false : prev));
    }
  }

  useEffect(() => {
    // Pick up a session key handed back by the OAuth callback. Safari ITP
    // often drops cross-site cookies, so the backend also passes the key in
    // the URL fragment on the same-tab fallback, and via postMessage for
    // the popup flow. Stash it in localStorage and let `X-Session-Key`
    // header-auth take over from there.
    try {
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = window.location.hash.replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const sk = params.get("om_session");
        if (sk) {
          window.localStorage.setItem("om_session", sk);
          // Clean the fragment so the key never lingers in the address bar
          // or gets shared via copy-paste.
          history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      }
    } catch {}

    checkStatus();

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        if (event.data.sessionKey) {
          try {
            window.localStorage.setItem("om_session", event.data.sessionKey);
          } catch {}
        }
        setConnected(true);
        // Re-check so the header (user name/avatar) gets populated from
        // /api/auth/status — connected=true alone is not enough.
        checkStatus();
      }
    }
    // Re-check auth when the tab becomes visible again (iOS back/forward
    // restores from bfcache and fires pageshow; visibilitychange fires
    // when returning from a background tab).
    function handleVisible() {
      if (document.visibilityState === "visible") {
        checkStatus();
      }
    }
    function handlePageShow() {
      checkStatus();
    }

    window.addEventListener("message", handleMessage);
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // Still checking auth status
  if (connected === null) {
    return <LoadingOverlay message="Loading" />;
  }

  // Not authenticated — show welcome/login screen
  if (!connected) {
    return <WelcomeScreen onAuthenticated={() => setConnected(true)} />;
  }

  // Authenticated — show the form builder dashboard
  return <Dashboard />;
}
