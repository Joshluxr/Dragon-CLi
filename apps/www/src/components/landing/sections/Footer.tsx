"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="pt-6 pb-6 border-t border-border/40">
      <div className="container mx-auto px-6">
        <div className="flex flex-wrap items-center justify-center gap-6 gap-y-2 text-sm text-muted-foreground mb-4">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="https://twitter.com/terragonlabs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Twitter
          </Link>
        </div>
        <div className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Terragon Labs Inc. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
