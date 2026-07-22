"use client";

import { useSyncExternalStore } from "react";

// Renders a UTC ISO timestamp in the viewer's own timezone. Server components
// can't know the visitor's timezone, so during SSR (and first paint) we show a
// stable UTC value, then swap to local time after hydration. useSyncExternalStore
// gives us that server/client split without a setState-in-effect.
const noopSubscribe = () => () => {};

export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const text = useSyncExternalStore(
    noopSubscribe,
    () => format(iso, dateOnly, undefined),
    () => format(iso, dateOnly, "UTC"),
  );
  return <span suppressHydrationWarning>{text}</span>;
}

function format(iso: string, dateOnly: boolean, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat(timeZone ? "en-GB" : undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
