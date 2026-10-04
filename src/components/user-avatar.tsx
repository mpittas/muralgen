"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AuthUser } from "@/store/auth-store";

export function initialsOf(user: Pick<AuthUser, "displayName" | "email">): string {
  const source = user.displayName?.trim() || user.email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<AuthUser, "displayName" | "email" | "photoURL">;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-xs font-semibold text-primary-foreground",
        className,
      )}
    >
      {user.photoURL && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsOf(user)
      )}
    </span>
  );
}
