"use client";

import { useEffect, useRef, useState } from "react";
import TestimonialCard from "./TestimonialCard";

export type Testimonial = {
  nameOrRole: string;
  photo?: string;
  handle?: string;
  quote: string;
  verified?: boolean;
};

export default function InfiniteScrollColumn({
  testimonials,
  speed = 30,
  className = "",
  direction = "up",
}: {
  testimonials: Array<Testimonial>;
  speed?: number;
  className?: string;
  direction?: "up" | "down";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);
  const heightRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    const container = containerRef.current;
    if (!scrollContainer || !container) return;

    const calculateHeight = () => {
      const children = scrollContainer.children;
      if (children.length > 0) {
        const halfLength = children.length / 2;
        const first = children[0] as HTMLElement;
        const repeat = children[halfLength] as HTMLElement;
        const firstRect = first.getBoundingClientRect();
        const repeatRect = repeat.getBoundingClientRect();
        const totalHeight = repeatRect.top - firstRect.top;
        heightRef.current = totalHeight;
      }
    };

    const timeoutId = window.setTimeout(calculateHeight, 50);
    const resizeObserver = new ResizeObserver(() => calculateHeight());
    resizeObserver.observe(scrollContainer);

    let animationId: number;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = now;
      const deltaMs = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (!isPaused && heightRef.current > 0) {
        const deltaSec = deltaMs / 1000;
        const loopHeight = heightRef.current;
        const dpr = window.devicePixelRatio || 1;
        if (direction === "down") {
          scrollPosRef.current -= speed * deltaSec;
          if (scrollPosRef.current < 0) {
            const wrapped =
              ((scrollPosRef.current % loopHeight) + loopHeight) % loopHeight;
            scrollPosRef.current = Math.round(wrapped * dpr) / dpr;
          }
        } else {
          scrollPosRef.current += speed * deltaSec;
          if (scrollPosRef.current >= loopHeight) {
            const remainder = scrollPosRef.current % loopHeight;
            scrollPosRef.current = Math.round(remainder * dpr) / dpr;
          }
        }
        scrollContainer.style.transform = `translate3d(0, -${scrollPosRef.current}px, 0)`;
      }

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.clearTimeout(timeoutId);
      lastTimeRef.current = null;
    };
  }, [speed, isPaused, direction]);

  return (
    <div
      ref={containerRef}
      className={`group ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div ref={scrollRef} className="space-y-4 will-change-transform">
        {[...testimonials, ...testimonials].map((testimonial, index) => (
          <TestimonialCard key={index} {...testimonial} />
        ))}
      </div>
    </div>
  );
}
