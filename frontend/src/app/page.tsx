"use client";

import { useEffect, useState } from "react";
import WelcomeScreen from "@/components/WelcomeScreen";
import Dashboard from "@/components/Dashboard";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export default function HomePage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  async function checkStatus() {
    try {
      const res = await fetch(`${API_BASE}/auth/status`);
      const data = await res.json();
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
    return (
      <div className="login-screen">
        <div className="login-bg" aria-hidden="true" />
        <div className="login-checking" style={{ position: "relative", zIndex: 1 }}>
          <div className="login-spinner" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  // Not authenticated — show welcome/login screen
  if (!connected) {
    return <WelcomeScreen onAuthenticated={() => setConnected(true)} />;
  }

  // Authenticated — show the form builder dashboard
  return <Dashboard />;
}
