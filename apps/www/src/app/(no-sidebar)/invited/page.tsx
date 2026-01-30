import { getUserInfoOrNull } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { InvitedWaitlist } from "@/components/invited-waitlist";
import { StructuredData } from "@/components/system/structured-data";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { validateAccessCode } from "@terragon/shared/model/access-codes";
import { db } from "@/lib/db";
import { OG_IMAGE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "You've been invited to Terragon",
  description:
    "Join Terragon with your exclusive access code and start using background agents for Claude Code.",
  openGraph: {
    title: "You've been invited to Terragon",
    description:
      "Join Terragon with your exclusive access code and start using background agents for Claude Code.",
    url: "https://www.terragonlabs.com/invited",
    siteName: "Terragon",
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: "Terragon - Background agents for Claude Code",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "You've been invited to Terragon",
    description:
      "Join Terragon with your exclusive access code and start using background agents for Claude Code.",
    site: "@terragonlabs",
    creator: "@terragonlabs",
    images: [OG_IMAGE_URL],
  },
  keywords: [
    "Terragon",
    "AI coding assistant",
    "Claude Code",
    "background agents",
    "invited",
    "exclusive access",
  ],
  alternates: {
    canonical: "https://www.terragonlabs.com/invited",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function InvitedPage() {
  // Check for access code cookie
  const cookieStore = await cookies();
  const accessCodeCookie = cookieStore.get("access_code");

  if (!accessCodeCookie || !accessCodeCookie.value) {
    // No access code, redirect to homepage
    redirect("/");
  }

  // Validate the access code is valid and unused
  const isValid = await validateAccessCode({
    db,
    code: accessCodeCookie.value,
  });

  if (!isValid) {
    // Invalid or already used access code, redirect to homepage
    redirect("/");
  }

  const userInfo = await getUserInfoOrNull();

  if (userInfo && userInfo.userFlags.hasSeenOnboarding) {
    redirect("/dashboard");
  } else if (userInfo) {
    redirect("/welcome");
  }

  return (
    <>
      <InvitedWaitlist />
      <StructuredData />
    </>
  );
}
