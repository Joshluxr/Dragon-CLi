import React from "react";
import { Box } from "ink";
import { UpdateNotifier } from "./UpdateNotifier.js";

interface RootLayoutProps {
  children: React.ReactNode;
}

export function RootLayout({ children }: RootLayoutProps) {
  return (
    <Box flexDirection="column">
      <UpdateNotifier />
      {children}
    </Box>
  );
}
