"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { publicDocsUrl } from "@terragon/env/next-public";

const options = [
  "commute",
  "shop",
  "cook",
  "lift",
  "think",
  "sleep",
  "code",
  "ship",
  "golf",
  "party",
  "raise",
  "tweet",
  "gossip",
];

export function Hero() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = options[currentIndex] as string;
    const typingSpeed = isDeleting ? 50 : 100;
    const pauseTime = 3000;
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          // Typing forward
          if (displayText.length < currentWord.length) {
            setDisplayText(currentWord.slice(0, displayText.length + 1));
          } else {
            // Finished typing, pause then start deleting
            setTimeout(() => setIsDeleting(true), pauseTime);
          }
        } else {
          // Deleting
          if (displayText.length > 0) {
            setDisplayText(displayText.slice(0, -1));
          } else {
            // Finished deleting, move to next word
            setIsDeleting(false);
            setCurrentIndex((prev) => (prev + 1) % options.length);
          }
        }
      },
      isDeleting
        ? typingSpeed
        : displayText.length === currentWord.length
          ? 0
          : typingSpeed,
    );

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, currentIndex]);

  return (
    <section className="flex items-center justify-center pt-8">
      {/* Content */}
      <div className="z-10 w-full text-center">
        <div className="space-y-4 sm:space-y-6 py-8 sm:py-14">
          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight px-2">
            Code while you{" "}
            <span className="inline-block">
              <span className="bg-foreground bg-clip-text text-transparent">
                {displayText}
              </span>
              <span className="animate-blink bg-primary inline-block w-[3px] h-[0.9em] mb-1 ml-1 align-middle" />
            </span>
          </h1>
          {/* Subheadline */}
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground px-4 sm:px-6">
            Delegate to AI, so you can focus on the work that matters
          </p>
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4 justify-center items-center px-4">
            <Button
              variant="default"
              asChild
              size="lg"
              className="text-sm sm:text-md p-4 sm:p-6 w-full sm:w-auto"
            >
              <Link href="/login">Get started for free</Link>
            </Button>
            <Button
              size="lg"
              className="text-sm sm:text-md p-4 sm:p-6 w-full sm:w-auto"
              variant="outline"
              asChild
            >
              <Link target="_blank" href={publicDocsUrl()}>
                Learn more
              </Link>
            </Button>
          </div>
        </div>
        <div className="relative mt-8 sm:mt-12">
          <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-lg" />
          <div className="relative w-full rounded-lg bg-white border overflow-hidden">
            <video
              src="https://cdn.terragonlabs.com/sawyerui-Vxci.webm"
              className="w-full h-auto"
              controls
              muted
              autoPlay
              playsInline
              loop
            />
          </div>
        </div>
      </div>
    </section>
  );
}
