"use client";

import { Button } from "@/components/ui/button";
import { publicDocsUrl } from "@terragon/env/next-public";
import Link from "next/link";

export default function CTA() {
  return (
    <section className="py-8 sm:py-12 md:py-16 lg:py-24">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-6 sm:p-8 md:p-12 lg:p-16">
        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 sm:mb-6">
            Ready to ship faster?
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto px-2">
            Join thousands of developers building with Terragon
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-2">
            <Button
              variant="default"
              asChild
              size="lg"
              className="text-sm sm:text-md p-4 sm:p-6 w-full sm:w-auto"
            >
              <Link href="/login">Get started for free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              className="text-sm sm:text-md p-4 sm:p-6 w-full sm:w-auto"
              variant="outline"
            >
              <Link target="_blank" href={publicDocsUrl()}>
                Learn more
              </Link>
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-4 sm:mt-6 px-2">
            Start your 14-day free trial today. No credit card required.
          </p>
        </div>

        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 sm:w-64 sm:h-64 bg-primary/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-32 h-32 sm:w-64 sm:h-64 bg-primary/10 rounded-full blur-3xl -z-10" />
      </div>
    </section>
  );
}
