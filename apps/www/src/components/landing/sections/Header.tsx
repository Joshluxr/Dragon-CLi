"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Wordmark } from "@/components/shared/wordmark";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { publicDocsUrl } from "@terragon/env/next-public";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full z-50 bg-background w-full">
      <div className="w-full px-4 h-16 flex items-center gap-4 max-w-6xl mx-auto">
        {/* Logo */}
        <Wordmark size="sm" />

        {/* Navigation - Desktop (absolutely centered) */}
        <nav className="hidden md:flex items-center gap-6 text-sm mt-0.5">
          <a
            href="#how-it-works"
            className="hover:text-muted-foreground transition-colors"
          >
            How It Works
          </a>
          <a
            href="#features"
            className="hover:text-muted-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="hover:text-muted-foreground transition-colors"
          >
            Pricing
          </a>
          <a
            href={publicDocsUrl()}
            target="_blank"
            className="hover:text-muted-foreground transition-colors"
          >
            Docs
          </a>
        </nav>

        <div className="flex-1" />
        {/* Login Button - Desktop */}
        <div className="hidden md:block">
          <Button variant="default" asChild size="lg">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <button className="md:hidden p-2 hover:bg-accent rounded-md transition-colors">
              <MenuIcon className="size-5" />
              <span className="sr-only">Open menu</span>
            </button>
          </SheetTrigger>
          <SheetContent side="top" className="w-full p-6">
            <nav className="flex flex-col gap-6">
              <a
                href="#how-it-works"
                className="text-lg text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                How It Works
              </a>
              <a
                href="#features"
                className="text-lg text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Features
              </a>
              <a
                href={publicDocsUrl()}
                target="_blank"
                className="text-lg text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </a>
              <a
                href="#pricing"
                className="text-lg text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <Button variant="default" className="w-full" asChild size="lg">
                <Link href="/login">Sign In</Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
