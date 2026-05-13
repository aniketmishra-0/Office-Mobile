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
    checkStatus();

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        setConnected(true);
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
