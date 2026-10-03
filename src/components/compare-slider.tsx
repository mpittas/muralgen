"use client";

/* eslint-disable @next/next/no-img-element -- blob: URLs can't go through next/image */
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CompareSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  aspectRatio?: number;
  className?: string;
  /** Rendered above both images (e.g. a grid overlay); must not capture pointer events. */
  overlay?: React.ReactNode;
}

/** Before/after viewer: drag, click or use the arrow keys. */
export function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  aspectRatio,
  className,
  overlay,
}: CompareSliderProps) {
  const [pos, setPos] = useState(0.5);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  }, []);

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && update(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 0.05));
        if (e.key === "ArrowRight") setPos((p) => Math.min(1, p + 0.05));
      }}
      style={aspectRatio ? { aspectRatio } : undefined}
      className={cn(
        "relative w-full cursor-ew-resize touch-none overflow-hidden rounded-xl bg-checker select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <img
        src={afterSrc}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
      <img
        src={beforeSrc}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${(1 - pos) * 100}% 0 0)` }}
      />
      {overlay}
      <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
        {afterLabel}
      </span>
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${pos * 100}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 7-5 5 5 5" />
            <path d="m15 7 5 5-5 5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
