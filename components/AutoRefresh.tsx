"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Re-fetches the current server component tree when the countdown hits 0, and
 * immediately when the tab becomes visible again. Client state (filters,
 * calculator inputs) is preserved across refreshes.
 */
export default function AutoRefresh({ intervalMs = 60_000, label }: { intervalMs?: number; label?: string }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(Math.round(intervalMs / 1000));

  useEffect(() => {
    const intervalSec = Math.round(intervalMs / 1000);
    let deadline = Date.now() + intervalMs;

    const refresh = () => {
      deadline = Date.now() + intervalMs;
      setSecondsLeft(intervalSec);
      router.refresh();
    };

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setSecondsLeft(0);
        refresh();
        return;
      }
      setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const id = setInterval(tick, 250);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, router]);

  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" title={`Refreshes every ${Math.round(intervalMs / 1000)}s`}>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      {label}
      <span className="tabular-nums text-slate-600">· {secondsLeft}s</span>
    </span>
  );
}
