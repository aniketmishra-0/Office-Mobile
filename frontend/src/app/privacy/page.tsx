"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { safeBack } from "@/lib/navigation";

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", backgroundColor: "var(--cream)" }}>
      <AppHeader title="Privacy Policy" showBack onBack={() => safeBack(router)} />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontFamily: "var(--font-newsreader), Georgia, serif", fontWeight: 400, fontSize: 26, color: "var(--ink)", margin: 0 }}>
              Privacy Policy
            </h1>
            <p style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 11, color: "var(--stone)", marginTop: 6 }}>
              Last updated: May 13, 2025
            </p>
          </div>

          {/* Content */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            <Section title="1. Introduction">
              <P>
                Office Mobile (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the app&rdquo;) is a tool that
                converts Google Sheets into mobile-friendly data entry forms. This Privacy Policy
                explains how we collect, use, protect, and share your information when you use our service.
              </P>
            </Section>

            <Section title="2. Data We Access">
              <P>When you connect your Google Account, we request access to:</P>
              <UL>
                <li><strong>Google Sheets</strong> — To read column headers from your spreadsheets and write form submissions back to your sheets.</li>
                <li><strong>Google Drive (limited)</strong> — To upload files/images submitted through forms and store them in your Google Drive.</li>
              </UL>
              <P>
                We use the <Code>drive.file</Code> scope, which only allows access to files created by this app — not your entire Drive.
              </P>
            </Section>

            <Section title="3. Google API Services User Data Policy (Limited Use)">
              <P>
                Office Mobile&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
                <A href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</A>, including the Limited Use requirements.
              </P>
              <P>Specifically:</P>
              <UL>
                <li>We only use Google data to provide and improve the form-generation functionality.</li>
                <li>We do not use your Google data for targeted advertisements.</li>
                <li>We do not allow humans to read your data unless we have your affirmative agreement, it is necessary for security purposes, to comply with applicable law, or for internal operations with aggregated and anonymized data.</li>
              </UL>
            </Section>

            <Section title="4. Data We Store">
              <P>We store the following data on our servers:</P>
              <UL>
                <li>Form configuration (field names, types, and settings)</li>
                <li>OAuth tokens to maintain your Google connection</li>
                <li>A local copy of form submissions for history/backup</li>
              </UL>
              <P>
                <strong>We never store the contents of your Google Sheets.</strong> Data flows directly from the form to your sheet.
              </P>
            </Section>

            <Section title="5. Data Sharing">
              <P>
                We do <strong>not</strong> sell, share, or transfer your data to any third parties for any purpose, including advertising or marketing.
                Your data is only transmitted between your browser, our secure servers, and Google&apos;s APIs to facilitate the core functionality.
              </P>
            </Section>

            <Section title="6. Data Security">
              <P>
                We use industry-standard security measures including HTTPS encryption for all data transfers.
                OAuth tokens are stored securely on the server and are never exposed to the frontend.
              </P>
            </Section>

            <Section title="7. Your Rights and Data Deletion">
              <P>You have full control over your data. You can at any time:</P>
              <UL>
                <li>Disconnect your Google Account from within the app settings.</li>
                <li>Revoke access via your <A href="https://myaccount.google.com/permissions">Google Account Permissions</A>.</li>
                <li>Request complete deletion of your account and associated data by contacting us.</li>
              </UL>
            </Section>

            <Section title="8. Cookies">
              <P>
                We use essential cookies only for maintaining your session and authentication state.
                We do not use analytics, advertising, or tracking cookies.
              </P>
            </Section>

            <Section title="9. Changes to This Policy">
              <P>
                We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated &ldquo;Last updated&rdquo; date.
              </P>
            </Section>

            <Section title="10. Contact Us">
              <P>
                If you have questions about this Privacy Policy or your data, please contact us at{" "}
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ fontFamily: "var(--font-plex-mono), monospace", fontSize: 12, background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4, padding: "2px 6px" }}>
      {children}
    </code>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink)", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 2 }}>
      {children}
    </a>
  );
}
