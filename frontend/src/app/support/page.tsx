"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { safeBack } from "@/lib/navigation";

export default function SupportPage() {
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Support" showBack onBack={() => safeBack(router)} />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 26, color: "var(--ink)", margin: 0 }}>
              How can we help?
            </h1>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)", marginTop: 8, lineHeight: 1.6 }}>
              We&apos;re here to help you get the most out of Office Mobile.
            </p>
          </div>

          {/* Support cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <SupportCard
              icon="✉"
              title="Email Support"
              description="Have a question or facing an issue? Drop us an email and we'll get back to you within 24 hours."
              action={
                <a
                  href="mailto:aniketmishra492@gmail.com"
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                    color: "var(--cream)", background: "var(--ink)", border: "none",
                    borderRadius: 6, padding: "10px 18px", cursor: "pointer",
                    textDecoration: "none", display: "inline-block",
                  }}
                >
                  aniketmishra492@gmail.com
                </a>
              }
            />

            <SupportCard
              icon="?"
              title="FAQs"
              description="Quick answers to common questions about Office Mobile."
              action={
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  <FAQ q="How do I connect my Google Sheet?" a="Paste your Google Sheet URL on the Dashboard or any feature page. You'll be prompted to sign in with Google if not already connected." />
                  <FAQ q="Can multiple people use the same sheet?" a="Yes! Anyone with the sheet URL can use Office Mobile to fill forms. Edit access depends on their Google permissions." />
                  <FAQ q="Is my data safe?" a="Absolutely. We never store your sheet data. Everything flows directly between your browser and Google's servers. Read our Privacy Policy for details." />
                  <FAQ q="How do I disconnect my account?" a="Go to Account Settings from the menu and click 'Disconnect Google Account', or revoke access from your Google Account permissions page." />
                  <FAQ q="Which browsers are supported?" a="Office Mobile works best on Chrome, Safari, Edge, and Firefox — both mobile and desktop." />
                </div>
              }
            />

            <SupportCard
              icon="⚡"
              title="Feature Requests"
              description="Have an idea to make Office Mobile better? We'd love to hear it."
              action={
                <a
                  href="mailto:aniketmishra492@gmail.com?subject=Feature%20Request%20-%20Office%20Mobile"
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                    color: "var(--ink)", background: "transparent", border: "1px solid var(--rule)",
                    borderRadius: 6, padding: "10px 18px", cursor: "pointer",
                    textDecoration: "none", display: "inline-block",
                  }}
                >
                  Send a feature request →
                </a>
              }
            />

            <SupportCard
              icon="🐛"
              title="Report a Bug"
              description="Found something broken? Let us know so we can fix it quickly."
              action={
                <a
                  href="mailto:aniketmishra492@gmail.com?subject=Bug%20Report%20-%20Office%20Mobile"
                  style={{
                    fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, fontWeight: 500,
                    color: "var(--ink)", background: "transparent", border: "1px solid var(--rule)",
                    borderRadius: 6, padding: "10px 18px", cursor: "pointer",
                    textDecoration: "none", display: "inline-block",
                  }}
                >
                  Report a bug →
                </a>
              }
            />
          </div>

          {/* Footer */}
          <div style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--rule)", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 10, color: "var(--stone)" }}>
              © {new Date().getFullYear()} Office Mobile. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Support Card ─── */
function SupportCard({ icon, title, description, action }: { icon: string; title: string; description: string; action: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 12,
      padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{icon}</span>
        <h3 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 17, color: "var(--ink)", margin: 0 }}>
          {title}
        </h3>
      </div>
      <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, color: "var(--stone)", lineHeight: 1.6, margin: 0 }}>
        {description}
      </p>
      <div style={{ marginTop: 4 }}>
        {action}
      </div>
    </div>
  );
}

/* ─── FAQ Item ─── */
function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <details style={{ background: "var(--cream)", border: "1px solid var(--rule)", borderRadius: 8, padding: "12px 14px" }}>
      <summary style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, fontWeight: 500, color: "var(--ink)", cursor: "pointer", lineHeight: 1.5 }}>
        {q}
      </summary>
      <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", lineHeight: 1.6, margin: "8px 0 0", paddingLeft: 2 }}>
        {a}
      </p>
    </details>
  );
}
