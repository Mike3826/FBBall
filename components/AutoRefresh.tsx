"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Re-fetches the current server component tree on an interval while the tab is
 * visible, and immediately when the tab regains focus. Client state (filters,
 * calculator inputs) is preserved across refreshes.
 */
export default function AutoRefresh({ intervalMs = 60_000, label }: { intervalMs?: number; label?: string }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(Math.round(intervalMs / 1000));

  useEffect(() => {
    let left = Math.round(intervalMs / 1000);
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      left -= 1;
      if (left <= 0) {
        left = Math.round(intervalMs / 1000);
        router.refresh();
      }
      setSecondsLeft(left);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        left = Math.round(intervalMs / 1000);
        setSecondsLeft(left);
        router.refresh();
      }
    };
    const id = setInterval(tick, 1000);
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
