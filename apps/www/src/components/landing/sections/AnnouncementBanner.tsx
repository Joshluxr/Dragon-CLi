"use client";

import { ANNOUNCEMENT_BANNER_STRING } from "@/lib/constants";
import { publicDocsUrl } from "@terragon/env/next-public";

export default function AnnouncementBanner({
  isShutdownMode,
}: {
  isShutdownMode?: boolean;
}) {
  if (isShutdownMode) {
    return (
      <div className="w-full">
        <a
          href={`${publicDocsUrl()}/docs/resources/shutdown`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-3 px-4 text-center"
        >
          <span className="text-sm text-foreground inline-flex items-center justify-center gap-2 flex-wrap">
            <span className="bg-muted-foreground text-background text-xs font-semibold px-2.5 py-1 rounded-full">
              Notice
            </span>
            <span>Terragon is shutting down on February 9th, 2026.</span>
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className="w-full">
      <a
        href={`${publicDocsUrl()}/docs/resources/release-notes`}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3 px-4 text-center"
      >
        <span className="text-sm text-foreground inline-flex items-center justify-center gap-2 flex-wrap">
          <span className="bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(46,125,50,0.4)] dark:shadow-[0_0_12px_rgba(76,175,80,0.4)]">
            New
          </span>
          <span>{ANNOUNCEMENT_BANNER_STRING}</span>
        </span>
      </a>
    </div>
  );
}
