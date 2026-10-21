"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Invisible background sync. Does not render a countdown. */
export default function SilentRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = 0;
    let cancelled = false;

    const run = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < intervalMs - 1_000) return;
      last = now;
      try {
        await fetch("/api/sync", { method: "POST", cache: "no-store" });
      } catch {
        // keep showing the last snapshot
      }
      if (!cancelled) router.refresh();
    };

    const boot = setTimeout(run, 2_000);
    const id = setInterval(run, Math.min(30_000, intervalMs));
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelled = true;
      clearTimeout(boot);
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs, router]);

  return null;
}
