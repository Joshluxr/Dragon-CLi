"use client";

import InfiniteScrollColumn from "../shared/InfiniteScrollColumn";
import {
  testimonialColumn1,
  testimonialColumn2,
  testimonialColumn3,
} from "../testimonials-data";

export default function Testimonials() {
  return (
    <section className="container mx-auto px-4 max-w-6xl py-4">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-semibold text-foreground">
          What developers are saying about Terragon
        </h2>
        <p className="text-muted-foreground text-base mt-2">
          We're pretty sure you'll love it as much as they already do
        </p>
      </div>
      <div className="relative py-6 md:py-0">
        <div
          id="testimonials-container"
          className="h-[500px] overflow-hidden relative"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InfiniteScrollColumn
              testimonials={testimonialColumn1}
              speed={18}
              direction="up"
            />
            <InfiniteScrollColumn
              testimonials={testimonialColumn2}
              speed={22}
              className="hidden md:block"
              direction="down"
            />
            <InfiniteScrollColumn
              testimonials={testimonialColumn3}
              speed={26}
              className="hidden lg:block"
              direction="up"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8 md:h-12 bg-gradient-to-b from-background to-transparent z-10" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 md:h-12 bg-gradient-to-t from-background to-transparent z-10" />
        </div>
      </div>
    </section>
  );
}
