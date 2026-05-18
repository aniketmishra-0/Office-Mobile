"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { safeBack } from "@/lib/navigation";

export default function TermsPage() {
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Terms of Service" showBack onBack={() => safeBack(router)} />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 26, color: "var(--ink)", margin: 0 }}>
              Terms of Service
            </h1>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", marginTop: 6 }}>
              Last updated: May 13, 2025
            </p>
          </div>

          {/* Content */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            <Section title="1. Acceptance of Terms">
              <P>
                By using Office Mobile, you agree to these Terms of Service. If you do not agree, please do not use the app.
              </P>
            </Section>

            <Section title="2. Description of Service">
              <P>
                Office Mobile is a tool that converts Google Sheets into mobile-friendly forms for field data collection.
                The service allows users to create forms, collect responses, and have data automatically saved to their Google Sheets.
              </P>
            </Section>

            <Section title="3. Google Account">
              <P>
                To use certain features, you may connect your Google Account. You are responsible for maintaining the security of your account credentials.
                We access your Google data only as described in our <A href="/privacy">Privacy Policy</A>.
              </P>
            </Section>

            <Section title="4. User Responsibilities">
              <UL>
                <li>You must have the right to access the Google Sheets you connect</li>
                <li>You are responsible for the data you collect through forms</li>
                <li>You must not use the service for any unlawful purpose</li>
              </UL>
            </Section>

            <Section title="5. Data Ownership">
              <P>
                You retain full ownership of your data. Your spreadsheet data remains in your Google Account. We do not claim any rights to your content.
              </P>
            </Section>

            <Section title="6. Service Availability">
              <P>
                We strive to maintain high availability but do not guarantee uninterrupted service. We are not liable for any data loss or downtime.
              </P>
            </Section>

            <Section title="7. Limitation of Liability">
              <P>
                Office Mobile is provided &ldquo;as is&rdquo; without warranty of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.
              </P>
            </Section>

            <Section title="8. Changes to Terms">
              <P>
                We may modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
              </P>
            </Section>

            <Section title="9. Contact">
              <P>
                For questions about these Terms, contact us at{" "}
                <A href="mailto:aniketmishra492@gmail.com">aniketmishra492@gmail.com</A>
              </P>
            </Section>
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

/* ─── Reusable sub-components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 18, color: "var(--ink)", marginBottom: 10 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", lineHeight: 1.7, margin: "8px 0", opacity: 0.85 }}>
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 13, color: "var(--ink)", lineHeight: 1.7, margin: "8px 0", paddingLeft: 20, opacity: 0.85, listStyleType: "disc", display: "flex", flexDirection: "column", gap: 6 }}>
      {children}
    </ul>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      style={{ color: "var(--ink)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}
    >
      {children}
    </a>
  );
}
