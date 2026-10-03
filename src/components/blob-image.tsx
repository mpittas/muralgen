"use client";

/* eslint-disable @next/next/no-img-element -- blob: URLs can't go through next/image */
import { cn } from "@/lib/utils";
import { useBlobUrl } from "@/hooks/use-blob-url";

interface BlobImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "id"> {
  id: string | null | undefined;
  alt: string;
}

/** `<img>` for an image stored locally (IndexedDB). Shows a pulse while it loads. */
export function BlobImage({ id, alt, className, ...rest }: BlobImageProps) {
  const url = useBlobUrl(id);
  if (!url) {
    return <div aria-hidden className={cn("animate-pulse bg-muted", className)} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      className={className}
      {...rest}
    />
  );
}
