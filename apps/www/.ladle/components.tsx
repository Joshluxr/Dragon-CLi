import React from "react";
import "@/app/globals.css";
import type { GlobalProvider } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: false,
    },
  },
});

export const Provider: GlobalProvider = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
