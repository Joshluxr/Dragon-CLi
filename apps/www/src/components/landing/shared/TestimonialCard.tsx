"use client";

import Image from "next/image";
import { BadgeCheck } from "lucide-react";

export default function TestimonialCard({
  nameOrRole,
  photo,
  handle,
  quote,
  verified,
}: {
  nameOrRole: string;
  photo?: string;
  handle?: string;
  quote: string;
  verified?: boolean;
}) {
  return (
    <div className="bg-sidebar text-card-foreground rounded-xl border border-border p-6 break-inside-avoid hover:shadow-md transition-shadow">
      <div
        className={`flex gap-3 mb-3 ${!handle ? "items-center" : "items-start"}`}
      >
        {photo ? (
          <Image
            src={photo}
            alt={nameOrRole}
            width={40}
            height={40}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            {nameOrRole && (
              <span className="font-bold text-base truncate">{nameOrRole}</span>
            )}
            {verified && (
              <BadgeCheck className="w-4 h-4 flex-shrink-0 fill-primary stroke-primary-foreground" />
            )}
          </div>
          {handle && (
            <span className="text-muted-foreground text-sm">{handle}</span>
          )}
        </div>
      </div>
      <div className="text-sm leading-relaxed whitespace-pre-line">{quote}</div>
    </div>
  );
}
