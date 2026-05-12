import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — AllinForm",
  description: "Terms of Service for AllinForm.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-5 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-gray-400 mt-2">
            Last updated: May 13, 2025
          </p>
        </div>

        <div className="prose prose-gray prose-sm max-w-none space-y-8 text-[15px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>
              By using AllinForm, you agree to these Terms of Service. If you do not
              agree, please do not use the app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p>
              AllinForm is a tool that converts Google Sheets into mobile-friendly
              forms for field data collection. The service allows users to create
              forms, collect responses, and have data automatically saved to their
              Google Sheets.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Google Account</h2>
            <p>
              To use certain features, you may connect your Google Account. You are
              responsible for maintaining the security of your account credentials.
              We access your Google data only as described in our{" "}
              <a href="/privacy" className="text-accent-600 hover:underline">
                Privacy Policy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. User Responsibilities</h2>
            <ul className="list-disc pl-5 mt-2 space-y-1.5">
              <li>You must have the right to access the Google Sheets you connect</li>
              <li>You are responsible for the data you collect through forms</li>
              <li>You must not use the service for any unlawful purpose</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Ownership</h2>
            <p>
              You retain full ownership of your data. Your spreadsheet data remains
              in your Google Account. We do not claim any rights to your content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Service Availability</h2>
            <p>
              We strive to maintain high availability but do not guarantee
              uninterrupted service. We are not liable for any data loss or
              downtime.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Limitation of Liability</h2>
            <p>
              AllinForm is provided &quot;as is&quot; without warranty of any kind.
              We shall not be liable for any indirect, incidental, or consequential
              damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Changes to Terms</h2>
            <p>
              We may modify these terms at any time. Continued use of the service
              after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a
                href="mailto:aniketmishra492@gmail.com"
                className="text-accent-600 hover:text-accent-700 font-medium"
              >
                aniketmishra492@gmail.com
              </a>
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            © {new Date().getFullYear()} AllinForm. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
