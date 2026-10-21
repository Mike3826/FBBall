"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const ANIM_MS = 400;

export default function BenchToggle({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const gen = useRef(0);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const toggle = () => {
    if (busy.current) return;
    const token = ++gen.current;
    busy.current = true;
    setOpen((v) => !v);
    timer.current = window.setTimeout(() => {
      if (token !== gen.current) return;
      busy.current = false;
      timer.current = null;
    }, ANIM_MS);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="cursor-pointer select-none text-xs text-slate-500 hover:text-slate-300"
      >
        {open ? `Hide ${count} not in bestball` : `Show ${count} more`}
      </button>
      <div
        className={`grid motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        style={{ transition: `grid-template-rows ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
      >
        <div className="min-h-0 overflow-hidden">
          <ul
            className={`mt-1 space-y-1 opacity-60 motion-reduce:transition-none ${open ? "translate-y-0" : "-translate-y-2"}`}
            style={{ transition: `transform ${ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
          >
            {children}
          </ul>
        </div>
      </div>
    </div>
  );
}
