"use client";

import Link from "next/link";
import { BookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publicDocsUrl } from "@terragon/env/next-public";
import posthog from "posthog-js";

interface DocsButtonProps {
  location: string;
}

export function DocsButton({ location }: DocsButtonProps) {
  return (
    <Button
      variant="outline"
      size="lg"
      className="py-2 w-auto"
      onClick={() => {
        posthog.capture("documentation_clicked", {
          location,
        });
      }}
      asChild
    >
      <Link href={publicDocsUrl()} target="_blank">
        <BookText className="w-4 h-4" />
        <span className="hidden sm:block">Explore documentation</span>
        <span className="block sm:hidden">Docs</span>
      </Link>
    </Button>
  );
}
