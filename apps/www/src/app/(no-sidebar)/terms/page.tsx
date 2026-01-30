import Footer from "@/components/landing/sections/Footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Terragon Labs",
  description:
    "Terms of Use for Terragon Labs Inc., an AI-powered coding assistant platform that allows you to run coding agents in parallel inside remote sandboxes.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://www.terragonlabs.com/terms",
  },
};

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <article className="prose prose-slate max-w-none">
          <header className="text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
              Terragon Labs Inc. Terms of Use
            </h1>
            <div className="text-muted-foreground">
              <p>Last revised on: September 25, 2025</p>
            </div>
          </header>

          <div className="space-y-8 text-foreground leading-relaxed">
            <section>
              <p className="text-lg mb-6">
                Welcome to Terragon Labs Inc. ("Terragon Labs," "Company," "we,"
                "us," or "our"). These Terms of Use ("Terms") govern your access
                to and use of our website at terragonlabs.com, its
                documentation, integrations, and related services (collectively,
                the "Services").
              </p>

              <p>
                By accessing or using the Services, you agree to these Terms and
                our Privacy Policy, which is incorporated by reference. If you
                do not agree, do not use the Services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                1. Eligibility
              </h2>
              <p>
                You may not access or use the Services if you are under 13 years
                old. If you are between 13 and 18 (or the age of majority where
                you live), you may only use the Services with the consent of a
                parent or legal guardian. By using the Services, you represent
                and warrant that you meet these requirements.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. License to Use the Services
              </h2>
              <p className="mb-4">
                Subject to these Terms, we grant you a limited, non-exclusive,
                non-transferable, revocable license to access and use the
                Services for your personal or internal business use.
              </p>
              <p className="mb-4">
                We may modify, suspend, or discontinue the Services at any time,
                though we will use commercially reasonable efforts to avoid
                material disruption for active users.
              </p>
              <p>
                We may use cookies, local storage, and analytics services to
                remember device preferences and understand usage, as described
                in our Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. User Content
              </h2>
              <p className="mb-4">
                You retain ownership of all content you submit ("User Content").
                You grant Company a limited, worldwide, non-exclusive,
                royalty-free, sublicensable license to host, store, display,
                reproduce, and modify your User Content solely to operate,
                provide, secure, and improve the Services.
              </p>
              <p>
                You are responsible for your User Content. Do not post or
                transmit anything unlawful, infringing, harmful, or otherwise
                prohibited by these Terms.
              </p>
              <p className="mt-4">
                We may use aggregated and anonymized User Content to improve the
                Services for you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Feedback
              </h2>
              <p>
                If you provide us with suggestions, ideas, or other feedback
                ("Feedback"), you grant Company a perpetual, irrevocable,
                worldwide, royalty-free, sublicensable license to use and
                incorporate the Feedback into the Services without restriction
                or compensation to you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. Restrictions
              </h2>
              <p className="mb-4">You agree not to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>
                  Reverse engineer, decompile, or attempt to extract source code
                  from the Services;
                </li>
                <li>Interfere with or disrupt the Services;</li>
                <li>
                  Use the Services for unlawful purposes or in violation of
                  applicable laws;
                </li>
                <li>
                  Attempt to gain unauthorized access to accounts, systems, or
                  networks connected to the Services.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. Intellectual Property
              </h2>
              <p>
                The Services, including all content, features, and
                functionality, are owned by Company or its licensors and are
                protected by intellectual property laws. Except as expressly
                permitted in these Terms, you may not use, copy, or distribute
                any part of the Services without our prior written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Privacy
              </h2>
              <p>
                Your use of the Services is also governed by our Privacy Policy,
                which explains how we collect, use, and share information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Disclaimer of Warranties
              </h2>
              <p>
                The Services are provided "AS IS" and "AS AVAILABLE," without
                warranties of any kind, either express or implied. To the
                fullest extent permitted by law, Company disclaims all
                warranties, including implied warranties of merchantability,
                fitness for a particular purpose, and non-infringement.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by law, Company shall not be
                liable for indirect, incidental, consequential, or punitive
                damages. Our aggregate liability to you for any claim shall not
                exceed the greater of $100 or the amounts you paid (if any) to
                Company in the 12 months preceding the event giving rise to
                liability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. Indemnification
              </h2>
              <p>
                You agree to indemnify and hold harmless Company, its
                affiliates, and their respective officers, directors, employees,
                and agents from any claims, liabilities, damages, losses, and
                expenses arising out of your unlawful acts, infringement of
                third-party rights, or violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Release
              </h2>
              <p>
                If you have a dispute with another user, you release Company
                from claims arising from that dispute to the extent permitted by
                law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                12. Governing Law
              </h2>
              <p>
                These Terms are governed by the laws of the State of Delaware,
                excluding its conflict of laws principles. For claims not
                subject to arbitration, the state and federal courts in Delaware
                have exclusive jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                13. Dispute Resolution and Arbitration
              </h2>
              <p className="mb-4">
                Any dispute arising under these Terms will be resolved by
                binding arbitration administered by JAMS under its rules. You
                may bring claims in small-claims court if eligible. Nothing in
                this Agreement prevents a party from seeking public injunctive
                relief where required by law.
              </p>
              <p className="mb-4">
                Arbitration materials are confidential only to the extent they
                contain non-public business, financial, security, or personal
                information; the existence of the arbitration and any award need
                not be confidential unless ordered by the arbitrator.
              </p>
              <p>
                You and Company waive any right to participate in class actions
                or class arbitration. You may opt out of arbitration within 30
                days of accepting these Terms by emailing
                support@terragonlabs.com.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                14. Copyright Policy
              </h2>
              <p className="mb-4">
                We respect intellectual property rights. If you believe your
                work has been used in a way that constitutes copyright
                infringement, notify our designated Copyright Agent:
              </p>
              <div className="bg-muted/30 p-4 rounded-lg border">
                <p className="font-mono text-sm space-y-1">
                  <span className="block">
                    Legalinc Corporate Services Inc.
                  </span>
                  <span className="block">131 Continental Dr, Suite 305</span>
                  <span className="block">Newark, DE 19713, USA</span>
                  <span className="block">Telephone: (415) 707-2952</span>
                  <span className="block">Email: support@terragonlabs.com</span>
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                15. Modifications to Terms
              </h2>
              <p>
                We may update these Terms from time to time. For material
                changes, we will provide at least 14 days' advance notice by
                posting on the Site and, where possible, emailing you. Your
                continued use of the Services after changes become effective
                constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                16. Electronic Communications
              </h2>
              <p>
                By using the Services, you consent to receive communications
                from us electronically. You agree that electronic communications
                satisfy any legal requirement that such communications be in a
                hardcopy writing.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                17. Contact Information
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
