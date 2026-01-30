import Footer from "@/components/landing/sections/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Terragon Labs",
  description:
    "Privacy Policy for Terragon Labs Inc. Learn how we collect, use, and protect your personal information when using our AI-powered coding assistant platform.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://www.terragonlabs.com/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <article className="prose prose-slate max-w-none">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
              Terragon Labs Inc. Privacy Policy
            </h1>
            <div className="text-muted-foreground">
              <p>Effective Date: September 29, 2025</p>
            </div>
          </header>

          <div className="space-y-8 text-foreground leading-relaxed">
            <section>
              <p className="text-lg leading-relaxed">
                Terragon Labs Inc. ("Terragon Labs," "we," "us," or "our") is
                committed to protecting your privacy. This Privacy Policy
                describes how we collect, use, share, and protect information
                when you access or use our website at terragonlabs.com, its
                documentation, and related services (the "Services").
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                I. Information We Collect
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium text-foreground mb-3">
                    1. Information Collected via Technology
                  </h3>
                  <p className="mb-3">
                    We automatically collect certain non-personal and session
                    data, including:
                  </p>
                  <ul className="list-disc ml-6 space-y-2">
                    <li>IP addresses (used for rate limiting)</li>
                    <li>Browser user agent strings</li>
                    <li>Session tokens and expiration times</li>
                    <li>Usage metrics and event tracking</li>
                    <li>
                      Device preferences (via cookies/local storage) such as
                      selected AI model, repository or branch, timezone, UI
                      state, and git checkpointing
                    </li>
                  </ul>
                  <p className="mt-4">
                    We use cookies and client-side storage to remember
                    device-specific preferences. These generally expire after
                    one year. We do not use browser fingerprinting or cross-site
                    tracking pixels.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-medium text-foreground mb-3">
                    2. Information You Provide by Registering
                  </h3>
                  <p className="mb-3">
                    When you sign up or log in via OAuth integrations, we
                    collect account and identity data from your connected
                    provider, which may include:
                  </p>
                  <ul className="list-disc ml-6 space-y-2">
                    <li>Name</li>
                    <li>
                      Email address (verified, for authentication and
                      communication)
                    </li>
                    <li>Profile image/avatar (if available)</li>
                    <li>GitHub account ID (for authentication)</li>
                    <li>Slack user ID (if you enable Slack integration)</li>
                    <li>Timestamps for account creation and updates</li>
                  </ul>
                  <p className="mt-4">
                    We also store encrypted credentials and tokens required for
                    service integrations and model access. All such data is
                    encrypted both in transit and at rest.
                  </p>
                  <p className="mt-4">
                    We do not collect credit card information, billing
                    addresses, or payment details.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-medium text-foreground mb-3">
                    3. Children's Privacy
                  </h3>
                  <p>
                    Our Services are not directed to children under 13. We do
                    not knowingly collect personal information from minors. A
                    valid GitHub account is required for use.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                II. How We Use & Share Information
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-medium text-foreground mb-3">
                    Personal Information
                  </h3>
                  <p className="mb-3">
                    We do not rent, sell, or trade your personal information for
                    marketing. We use it to:
                  </p>
                  <ul className="list-disc ml-6 space-y-2">
                    <li>Operate, maintain, and improve our Services</li>
                    <li>Authenticate users and enable integrations</li>
                    <li>Communicate about accounts, features, and support</li>
                    <li>Enforce terms, prevent fraud, and ensure security</li>
                    <li>Send marketing communications where permitted</li>
                  </ul>
                  <p className="mt-4 mb-3">
                    We share personal information only as necessary with:
                  </p>
                  <ul className="list-disc ml-6 space-y-2">
                    <li>
                      Service providers under contract (hosting, email,
                      analytics, logging, cloud infrastructure)
                    </li>
                    <li>
                      Integration/OAuth providers (GitHub, Slack, OpenAI,
                      Claude, Gemini, Amp)
                    </li>
                    <li>Legal or regulatory authorities when required</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xl font-medium text-foreground mb-3">
                    Non-Personal Information
                  </h3>
                  <p>
                    We may use or disclose non-personal information for any
                    purpose, including trend analysis, service improvement, and
                    aggregate reporting.
                  </p>
                  <p className="mt-4">
                    We may use aggregated and anonymized User Content to improve
                    the Services for you.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                III. How We Protect Information
              </h2>
              <ul className="list-disc ml-6 space-y-2">
                <li>Encryption in transit (SSL/TLS) and encryption at rest</li>
                <li>
                  Secure hosting infrastructure with firewalls, intrusion
                  detection, and access controls
                </li>
                <li>Strict least-privilege access policies</li>
                <li>Isolated and sandboxed execution environments for code</li>
                <li>
                  Ephemeral access: repository and code data used only during
                  active tasks
                </li>
                <li>
                  Encrypted storage and handling of all tokens and credentials
                </li>
              </ul>
              <p className="mt-4">
                No system is completely secure. In case of a breach, we will
                respond according to applicable legal requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                IV. Your Rights Regarding Personal Information
              </h2>
              <ul className="list-disc ml-6 space-y-2">
                <li>Access and update your account information</li>
                <li>
                  Request deletion of your account and associated personal data
                </li>
                <li>
                  Opt out of marketing communications via unsubscribe links or
                  contacting us
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                V. Links to Other Websites
              </h2>
              <p>
                Our Services may include links to third-party websites. This
                Privacy Policy applies only to information collected by us. We
                encourage you to review their privacy practices independently.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                VI. Changes to This Privacy Policy
              </h2>
              <p>
                We may update this Privacy Policy over time. Any changes will be
                posted on this page with an updated "Effective Date." Please
                revisit this Privacy Policy periodically.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                VII. Contact Us
              </h2>
              <div className="bg-muted/30 p-6 rounded-lg border">
                <h3 className="font-semibold mb-3">Legal Department</h3>
                <div className="font-mono text-sm space-y-1">
                  <p>Terragon Labs Inc.</p>
                  <p>131 Continental Dr Suite 305</p>
                  <p>Newark, DE 19713, USA</p>
                  <p>Telephone: (415) 707-2952</p>
                  <p>Email: support@terragonlabs.com</p>
                </div>
              </div>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
