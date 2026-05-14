import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Office Mobile",
  description: "Privacy Policy for Office Mobile — how we handle your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="max-w-2xl mx-auto px-5 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-zinc-950 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            Last updated: May 13, 2025
          </p>
        </div>

        <div className="prose prose-zinc prose-sm max-w-none space-y-8 text-[15px] leading-relaxed text-zinc-700">
          {/* Introduction */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p>
              Office Mobile (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a tool that
              converts Google Sheets into mobile-friendly data entry forms. This Privacy Policy
              explains how we collect, use, protect, and share your information when you use our service.
            </p>
          </section>

          {/* Data We Access */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Data We Access</h2>
            <p>When you connect your Google Account, we request access to:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>
                <strong>Google Sheets</strong> — To read column headers from your spreadsheets
                and write form submissions back to your sheets.
              </li>
              <li>
                <strong>Google Drive (limited)</strong> — To upload files/images submitted through
                forms and store them in your Google Drive.
              </li>
            </ul>
            <p className="mt-3">
              We use the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[13px]">drive.file</code> scope,
              which only allows access to files created by this app — not your entire Drive.
            </p>
          </section>

          {/* Google API Services User Data Policy */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Google API Services User Data Policy (Limited Use)</h2>
            <p>
              Office Mobile&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
              <a 
                href="https://developers.google.com/terms/api-services-user-data-policy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-zinc-950 hover:underline font-medium"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p className="mt-3">Specifically:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>We only use Google data to provide and improve the form-generation functionality.</li>
              <li>We do not use your Google data for targeted advertisements.</li>
              <li>We do not allow humans to read your data unless we have your affirmative agreement for specific messages, doing so is necessary for security purposes such as investigating abuse, to comply with applicable law, or for the App&apos;s internal operations and even then only when the data have been aggregated and anonymized.</li>
            </ul>
          </section>

          {/* Data We Store */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Data We Store</h2>
            <p>We store the following data on our servers:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Form configuration (field names, types, and settings)</li>
              <li>OAuth tokens to maintain your Google connection</li>
              <li>A local copy of form submissions for history/backup</li>
            </ul>
            <p className="mt-3">
              <strong>We never store the contents of your Google Sheets.</strong> Data flows directly
              from the form to your sheet.
            </p>
          </section>

          {/* Data Sharing */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Sharing</h2>
            <p>
              We do <strong>not</strong> sell, share, or transfer your data to any third parties for any purpose, including for advertising or marketing. 
              Your data is only transmitted between your browser, our secure servers, and Google&apos;s APIs to facilitate the core functionality of the application.
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Data Security</h2>
            <p>
              We use industry-standard security measures including HTTPS encryption
              for all data transfers. OAuth tokens are stored securely on the server
              and are never exposed to the frontend.
            </p>
          </section>

          {/* User Rights */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Your Rights and Data Deletion</h2>
            <p>You have full control over your data. You can at any time:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>Disconnect your Google Account from within the app settings.</li>
              <li>
                Revoke access via your{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-950 hover:underline font-medium"
                >
                  Google Account Permissions
                </a>
                .
              </li>
              <li>Request complete deletion of your account and associated data by contacting us.</li>
            </ul>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Cookies</h2>
            <p>
              We use essential cookies only for maintaining your session and authentication state. We do not
              use analytics, advertising, or tracking cookies.
            </p>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. Any changes will
              be posted on this page with an updated &quot;Last updated&quot; date.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or your data, please contact the
              developer at{" "}
              <a
                href="mailto:aniketmishra492@gmail.com"
                className="text-zinc-950 hover:underline font-medium"
              >
                aniketmishra492@gmail.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            © {new Date().getFullYear()} Office Mobile. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
