"use client";

import { useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  busy?: boolean;
  title?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}

/** Drag & drop (or click / paste-free) image picker. */
export function Dropzone({
  onFiles,
  multiple = true,
  busy,
  title = "Drop images here",
  hint = "JPG, PNG or WebP — or click to browse",
  className,
  compact,
}: DropzoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = (list: FileList | null) => {
    if (!list) return;
    const files = [...list].filter((f) => f.type.startsWith("image/"));
    if (files.length) void onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card/40 text-center transition-colors outline-none hover:border-primary/60 hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50",
        compact ? "px-4 py-6" : "px-6 py-12",
        over && "border-primary bg-primary/5",
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        {busy ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
      </span>
      <div>
        <p className="text-sm font-medium">{busy ? "Processing…" : title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}
