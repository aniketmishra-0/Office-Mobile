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
      const res = await fetch(`${API_BASE}/api/auth/status`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.session_key) {
        try {
          window.localStorage.setItem("om_session", data.session_key);
        } catch {}
      }
      setConnected(Boolean(data.connected));
    } catch {
      setConnected(false);
    }
  }

  useEffect(() => {
    checkStatus();

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "oauth-success") {
        setConnected(true);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
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
