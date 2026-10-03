"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { useUiStore } from "@/store/ui-store";

export function NewProjectDialog() {
  const open = useUiStore((s) => s.newProjectOpen);
  const setOpen = useUiStore((s) => s.setNewProjectOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        {/* Remount the form every time the dialog opens so it starts empty. */}
        {open && <NewProjectForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const createProject = useAppStore((s) => s.createProject);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [client, setClient] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "").toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const finalTags = tagInput.trim()
      ? [...new Set([...tags, tagInput.trim().replace(/^#/, "").toLowerCase()])]
      : tags;
    const project = createProject({
      name: name.trim(),
      description: description.trim(),
      location: location.trim(),
      client: client.trim(),
      tags: finalTags,
    });
    onDone();
    router.push(`/projects/${project.id}/walls`);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>New mural project</DialogTitle>
        <DialogDescription>
          Give it a name — you&apos;ll upload the wall photos next.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="np-name">Project name</Label>
        <Input
          id="np-name"
          autoFocus
          required
          maxLength={80}
          placeholder="e.g. Riverside community centre"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="np-desc">
          Brief <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="np-desc"
          rows={2}
          placeholder="Theme, mood, anything the client asked for…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="np-loc">Location</Label>
          <Input id="np-loc" placeholder="City / address" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="np-client">Client</Label>
          <Input id="np-client" placeholder="Who's it for?" value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="np-tags">Tags</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 pr-1">
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => setTags(tags.filter((x) => x !== t))}
                className="rounded-sm p-0.5 hover:bg-foreground/10"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            id="np-tags"
            className="h-7 min-w-28 flex-1"
            placeholder="Add a tag, press Enter"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              }
            }}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}
