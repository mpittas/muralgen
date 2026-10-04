"use client";

import { useState } from "react";
import { Loader2, LogOut, Trash } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authErrorMessage,
  deleteAccount,
  reauthenticate,
  signOut,
  updateDisplayName,
} from "@/lib/firebase/auth";
import { deleteAllUserData, deleteProfileDoc } from "@/lib/firebase/sync";
import { useAuthStore } from "@/store/auth-store";

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const usesGoogle = user.providerIds.includes("google.com");
  const usesPassword = user.providerIds.includes("password");

  return (
    <>
      <PageHeader title="Profile" />
      <div className="mx-auto w-full max-w-3xl space-y-8 p-4 sm:p-6">
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex items-center gap-4">
            <UserAvatar user={user} className="size-14 text-lg" />
            <div className="min-w-0">
              <p className="truncate font-heading text-lg font-bold">
                {user.displayName || user.email}
              </p>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                Signed in with {[usesGoogle && "Google", usesPassword && "email & password"].filter(Boolean).join(" and ")}
              </p>
            </div>
          </div>
          {/* key remounts the form if the name changes elsewhere (e.g. another tab) */}
          <NameForm key={user.displayName ?? ""} initial={user.displayName ?? ""} />
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-lg font-bold">Session</h2>
          <Button
            variant="outline"
            onClick={() =>
              signOut().catch((err) => toast.error(authErrorMessage(err)))
            }
          >
            <LogOut /> Sign out
          </Button>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-destructive">Danger zone</h2>
            <p className="text-sm text-muted-foreground">
              These actions delete data from the cloud and cannot be undone.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <DeleteDataButton />
            <DeleteAccountButton needsPassword={usesPassword && !usesGoogle} />
          </div>
        </section>
      </div>
    </>
  );
}

function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== initial.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDisplayName(name);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex max-w-md items-end gap-2">
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          value={name}
          maxLength={60}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={!dirty || !name.trim() || saving}>
        {saving && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </form>
  );
}

function DeleteDataButton() {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Trash />} Delete all my data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all projects and images?</AlertDialogTitle>
          <AlertDialogDescription>
            Every project, wall photo, design and composition in your account will be removed
            permanently, on every device. Your account itself stays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              setBusy(true);
              try {
                await deleteAllUserData();
                toast.success("All your data was deleted");
              } catch (err) {
                toast.error(authErrorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountButton({ needsPassword }: { needsPassword: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await reauthenticate(needsPassword ? password : undefined);
      await deleteAllUserData();
      await deleteProfileDoc();
      await deleteAccount();
      toast.success("Your account was deleted");
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-destructive/40 text-destructive" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes your account together with all projects, walls, designs and compositions.
            {needsPassword
              ? " Enter your password to confirm."
              : " You will be asked to confirm with Google."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {needsPassword && (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-password">Password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={needsPassword && !password}
            onClick={run}
          >
            Delete account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
