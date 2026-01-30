import { getUserInfoOrNull } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing";
import { StructuredData } from "@/components/system/structured-data";
import type { Metadata } from "next";
import { OG_IMAGE_URL } from "@/lib/constants";
import { db } from "@/lib/db";
import { getFeatureFlagsGlobal } from "@terragon/shared/model/feature-flags";

export const maxDuration = 800;

export const metadata: Metadata = {
  title: "Terragon - Delegate coding tasks to AI background agents",
  description:
    "Run coding agents in parallel inside remote sandboxes. Automate multiple tasks concurrently and asynchronously with full development environments.",
  keywords: [
    "AI coding agents",
    "autonomous code assistant",
    "Claude Code",
    "OpenAI Codex",
    "Amp Code",
    "cloud development sandboxes",
    "GitHub automation",
    "AI pull requests",
  ],
  authors: [{ name: "Terragon Labs" }],
  creator: "Terragon Labs",
  publisher: "Terragon Labs",
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "Terragon - Delegate coding tasks to AI background agents",
    description:
      "Run coding agents in parallel inside remote sandboxes. Automate multiple development tasks concurrently with AI-powered assistance.",
    url: "https://www.terragonlabs.com",
    siteName: "Terragon",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Terragon - AI coding agents platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terragon - Delegate coding tasks to AI background agents",
    description:
      "Run coding agents in parallel inside remote sandboxes. Automate development tasks with AI.",
    site: "@terragonlabs",
    creator: "@terragonlabs",
    images: [OG_IMAGE_URL],
  },
  alternates: {
    canonical: "https://www.terragonlabs.com",
  },
  metadataBase: new URL("https://www.terragonlabs.com"),
};

export default async function Home() {
  const userInfo = await getUserInfoOrNull();
  if (userInfo && userInfo.userFlags.hasSeenOnboarding) {
    redirect("/dashboard");
  } else if (userInfo) {
    redirect("/welcome");
  }
  const flags = await getFeatureFlagsGlobal({ db });

  return (
    <>
      <StructuredData />
      <main className="w-full">
        <Landing isShutdownMode={flags.shutdownMode} />
      </main>
      {/* Google tag (gtag.js) - Production only */}
      {process.env.NODE_ENV === "production" && (
        <>
          <script
            async
            src="https://www.googletagmanager.com/gtag/js?id=AW-17691783165"
          />
          <script>
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'AW-17691783165');
            `}
          </script>
        </>
      )}
    </>
  );
}
