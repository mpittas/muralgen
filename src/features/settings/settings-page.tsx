"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, Monitor, Moon, Sun, Trash } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatBytes } from "@/lib/format";
import { providers } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { useSettingsStore } from "@/store/settings-store";

export function SettingsPage() {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const resetAll = useAppStore((s) => s.resetAll);
  const counts = {
    projects: useAppStore((s) => Object.keys(s.projects).length),
    walls: useAppStore((s) => Object.keys(s.walls).length),
    designs: useAppStore((s) => Object.keys(s.designs).length),
  };
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => {});
  }, [counts.designs, counts.walls]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
        <Section title="Appearance" description="MuralGen follows your system by default.">
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: "light", label: "Light", icon: Sun },
              { v: "dark", label: "Dark", icon: Moon },
              { v: "system", label: "System", icon: Monitor },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setTheme(o.v)}
                aria-pressed={hydrated && theme === o.v}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60",
                  hydrated && theme === o.v ? "border-primary ring-2 ring-primary" : "hover:border-foreground/30",
                )}
              >
                <o.icon className="size-5" />
                {o.label}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Image generators"
          description="Add more providers later without touching the rest of the app."
        >
          <ul className="divide-y rounded-xl border bg-card">
            {providers.map((p) => (
              <li key={p.id} className="flex items-start gap-3 p-4">
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                    p.status === "available" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {p.status === "available" ? <Check className="size-4" /> : <Cloud className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {p.name}
                    {p.free && p.status === "available" && <Badge variant="secondary">Free · no key</Badge>}
                    {p.status !== "available" && <Badge variant="outline">Coming with the backend</Badge>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{p.tagline}</p>
                  {p.limits && <p className="mt-1 text-xs text-muted-foreground">{p.limits}</p>}
                  {p.id === "ai-horde" && hydrated && <HordeKeyField />}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Local data"
          description="Until the Firebase backend is connected, everything lives in this browser."
        >
          <div className="space-y-4 rounded-xl border bg-card p-4">
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <Stat label="Projects" value={hydrated ? counts.projects : "–"} />
              <Stat label="Walls" value={hydrated ? counts.walls : "–"} />
              <Stat label="Designs" value={hydrated ? counts.designs : "–"} />
            </dl>
            {usage && (
              <p className="text-sm text-muted-foreground">
                Using {formatBytes(usage.used)} of roughly {formatBytes(usage.quota)} available in this browser.
              </p>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash /> Delete all local data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All projects, wall photos, designs and compositions stored in this browser will
                    be removed permanently.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      resetAll();
                      toast.success("All local data deleted");
                    }}
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Section>
      </div>
    </>
  );
}

function HordeKeyField() {
  const saved = useSettingsStore((s) => s.hordeApiKey);
  const setKey = useSettingsStore((s) => s.setHordeApiKey);
  const [value, setValue] = useState(saved);
  const [show, setShow] = useState(false);
  return (
    <div className="mt-3 grid max-w-md gap-1.5">
      <Label htmlFor="horde-key" className="text-xs">
        Your AI Horde key <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <div className="flex gap-2">
        <Input
          id="horde-key"
          type={show ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder="Anonymous (0000000000)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value.trim() !== saved && (setKey(value), toast.success(value.trim() ? "Key saved" : "Using anonymous access"))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="font-mono text-xs"
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShow((v) => !v)}>
          {show ? "Hide" : "Show"}
        </Button>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">
        A free account at{" "}
        <a href="https://aihorde.net/register" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          aihorde.net
        </a>{" "}
        gets you a personal key and better queue priority. It&apos;s stored only in this browser — the backend will hold keys
        server-side later.
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-bold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
