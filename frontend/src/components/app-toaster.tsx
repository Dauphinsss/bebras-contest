"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group/toast flex items-start gap-3 rounded-sm border bg-background px-4 py-3 text-foreground shadow-none",
          title: "text-sm font-semibold",
          description: "text-sm leading-6 text-muted-foreground",
          actionButton:
            "inline-flex h-9 items-center justify-center border border-transparent bg-primary px-3 text-sm font-semibold text-primary-foreground [box-shadow:var(--shadow-hard)] transition hover:bg-primary/90",
          cancelButton:
            "inline-flex h-9 items-center justify-center border border-border bg-background px-3 text-sm font-semibold text-foreground [box-shadow:var(--shadow-hard)] transition hover:bg-muted",
          closeButton:
            "border border-border bg-background text-foreground shadow-none transition hover:bg-muted",
          success: "border-primary",
          error: "border-destructive",
          warning: "border-secondary",
          info: "border-accent",
        },
      }}
    />
  );
}
