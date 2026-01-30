"use client";

import GridBackground from "./grid-background";
import Testimonials from "./sections/Testimonials";
import Footer from "./sections/Footer";
import BentoFeatures from "./sections/BentoFeatures";
import { Header } from "./sections/Header";
import { Hero } from "./sections/Hero";
import { SignInButtonForPreview } from "@/components/auth";
import { Pricing } from "./sections/Pricing";
import { FAQ } from "./sections/FAQ";
import CTA from "./sections/CTA";
import { HowItWorks } from "./sections/HowItWorks";
import AnnouncementBanner from "./sections/AnnouncementBanner";

export function Landing({ isShutdownMode }: { isShutdownMode?: boolean }) {
  return (
    <div className="flex flex-col min-h-[100dvh] w-full relative bg-background text-foreground overflow-x-hidden">
      <GridBackground />
      <Header />
      <main className="flex-1 pt-18 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <AnnouncementBanner isShutdownMode={isShutdownMode} />
        <Hero />
        <HowItWorks />
        <BentoFeatures />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
        <SignInButtonForPreview />
      </main>

      <Footer />
    </div>
  );
}
