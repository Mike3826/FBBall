"use client";

import { useState } from "react";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; text: string } | { kind: "error"; text: string };

function shortDate(ymd: string) {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Posts a top-10 table to Discord via /api/discord/publish — the latest completed
 * slate, or today's in-progress slate when nothing has finished yet.
 */
export default function PublishToDiscordButton({ target }: { target: { date: string; complete: boolean } | null }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = state.kind === "busy";

  async function publish() {
    if (busy || !target) return;
    const what = target.complete
      ? `Post the top 10 for ${shortDate(target.date)} to Discord?`
      : `Games are still in progress. Post a live snapshot of the ${shortDate(target.date)} top 10 to Discord?`;
    if (!window.confirm(what)) return;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/discord/publish", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; date?: string; count?: number; complete?: boolean; error?: string };
      if (json.ok && json.date) {
        setState({ kind: "done", text: `Posted ${json.complete ? "" : "live "}top ${json.count} for ${shortDate(json.date)}` });
      } else {
        setState({ kind: "error", text: json.error ?? `Failed (${res.status})` });
      }
    } catch (err) {
      setState({ kind: "error", text: (err as Error).message });
    }
  }

  const label = !target
    ? "Publish Top 10"
    : target.complete
      ? `Publish ${shortDate(target.date)} Top 10`
      : `Publish ${shortDate(target.date)} Top 10 (live)`;

  const title = !target
    ? "No games have been played yet"
    : target.complete
      ? `Publishes the final top 10 from ${shortDate(target.date)}`
      : `No slate has finished yet — publishes a live snapshot of today's top 10`;

  return (
    <div className="flex items-center gap-3">
      {state.kind === "done" && <span className="text-xs text-emerald-300">{state.text}</span>}
      {state.kind === "error" && <span className="max-w-xs truncate text-xs text-raptor-soft" title={state.text}>{state.text}</span>}
      <button
        type="button"
        onClick={publish}
        disabled={busy || !target}
        title={title}
        className="inline-flex items-center gap-2 rounded-md border-2 border-[#5865F2] bg-[#5865F2]/15 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#5865F2] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M19.54 5.34A17.3 17.3 0 0 0 15.3 4l-.2.4a16 16 0 0 1 3.9 1.9 14.6 14.6 0 0 0-14 0 16 16 0 0 1 3.9-1.9L8.7 4a17.3 17.3 0 0 0-4.24 1.34C1.76 9.4 1.03 13.36 1.4 17.26a17.4 17.4 0 0 0 5.2 2.63l1.1-1.8a11.3 11.3 0 0 1-1.76-.85l.43-.33a12.4 12.4 0 0 0 11.26 0l.43.33c-.56.33-1.15.62-1.76.85l1.1 1.8a17.4 17.4 0 0 0 5.2-2.63c.44-4.52-.74-8.44-3.06-11.92ZM8.68 14.9c-1.02 0-1.86-.94-1.86-2.1s.82-2.1 1.86-2.1 1.88.95 1.86 2.1c0 1.16-.82 2.1-1.86 2.1Zm6.64 0c-1.02 0-1.86-.94-1.86-2.1s.82-2.1 1.86-2.1 1.88.95 1.86 2.1c0 1.16-.82 2.1-1.86 2.1Z" />
        </svg>
        {busy ? "Publishing…" : label}
        {target && !target.complete && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-raptor-soft" />}
      </button>
    </div>
  );
}
