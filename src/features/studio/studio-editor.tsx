"use client";

/* eslint-disable @next/next/no-img-element -- blob: URLs can't go through next/image */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Check,
  Columns2,
  Eraser,
  Eye,
  Hand,
  Lasso,
  LoaderCircle,
  Maximize,
  MousePointer2,
  Paintbrush,
  Redo2,
  SlidersHorizontal,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLatest } from "@/hooks/use-latest";
import { useLoadedImage } from "@/hooks/use-loaded-image";
import { getBlob, newId, putBlob } from "@/lib/blob-store";
import { clamp, downloadBlob, slugify } from "@/lib/format";
import {
  canvasToBlob,
  createCanvas,
  fitWithin,
  loadImage,
  makeThumb,
} from "@/lib/image-utils";
import {
  Compositor,
  createMask,
  defaultQuad,
  fillPolygon,
  fullWallQuad,
  invertMask,
  paintDot,
  paintSegment,
  pointInQuad,
  resetMask,
  restoreMask,
  snapshotMask,
  type BrushMode,
} from "@/lib/studio/render";
import type { Composite, CompositeSettings, Design, Point, Quad, Wall } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore, useDesigns } from "@/store/app-store";
import { designLabel } from "@/features/designs/design-card";
import { StudioInspector } from "./studio-inspector";

type Tool = "move" | "erase" | "restore" | "lasso" | "hand";

const WORK_MAX = 1600;
const SAVE_MAX = 2048;
const EXPORT_MAX = 4096;
const HIT_PX = 18;
const HISTORY_LIMIT = 30;

interface Snap {
  quad: Quad;
  alpha: Uint8Array;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; panX: number; panY: number }
  | { kind: "corner"; index: number; moved: boolean }
  | { kind: "quad"; start: Point; orig: Quad; moved: boolean }
  | { kind: "brush"; last: Point; mode: BrushMode };

/** rAF when the tab is visible; a timer when it's hidden (rAF is paused there, which would stall renders). */
function scheduleFrame(cb: () => void): () => void {
  if (document.hidden) {
    const t = window.setTimeout(cb, 16);
    return () => window.clearTimeout(t);
  }
  const id = requestAnimationFrame(cb);
  return () => cancelAnimationFrame(id);
}

const cloneQuad = (q: Quad): Quad => q.map((p) => ({ ...p })) as Quad;

const TOOLS: { id: Tool; label: string; key: string; icon: typeof MousePointer2 }[] = [
  { id: "move", label: "Place artwork", key: "V", icon: MousePointer2 },
  { id: "erase", label: "Erase — hide artwork", key: "E", icon: Eraser },
  { id: "restore", label: "Restore — show artwork", key: "B", icon: Paintbrush },
  { id: "lasso", label: "Lasso mask", key: "L", icon: Lasso },
  { id: "hand", label: "Pan", key: "H", icon: Hand },
];

const HINTS: Record<Tool, string> = {
  move: "Drag the corners to match the wall's perspective · drag inside to move",
  erase: "Paint over windows, pipes or people to reveal the wall · [ ] resize",
  restore: "Paint to bring the artwork back · [ ] resize",
  lasso: "Click to outline an area · Enter or double-click to apply · Esc to cancel",
  hand: "Drag to pan · scroll to zoom",
};

export function StudioEditor({
  projectId,
  compositeId,
}: {
  projectId: string;
  compositeId: string;
}) {
  const composite = useAppStore((s) => s.composites[compositeId]);
  const wall = useAppStore((s) => (composite ? s.walls[composite.wallId] : undefined));
  const design = useAppStore((s) => (composite ? s.designs[composite.designId] : undefined));

  if (!composite || !wall || !design || design.status !== "ready") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-medium">This composition can&apos;t be opened.</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Its wall or design was deleted. Start a new one from the studio.
        </p>
        <Button asChild>
          <Link href={`/projects/${projectId}/studio`}>Back to studio</Link>
        </Button>
      </div>
    );
  }
  return (
    <EditorInner
      projectId={projectId}
      composite={composite}
      wall={wall}
      design={design}
    />
  );
}

function EditorInner({
  projectId,
  composite,
  wall,
  design,
}: {
  projectId: string;
  composite: Composite;
  wall: Wall;
  design: Design;
}) {
  const compositeId = composite.id;
  const updateComposite = useAppStore((s) => s.updateComposite);
  const readyDesigns = useDesigns(projectId).filter((d) => d.status === "ready");

  const { img: wallImg, url: wallUrl } = useLoadedImage(wall.imageId);
  const { img: designImg } = useLoadedImage(design.imageId);
  const work = useMemo(
    () => fitWithin(wall.width, wall.height, WORK_MAX),
    [wall.width, wall.height],
  );

  const [settings, setSettings] = useState<CompositeSettings>(composite.settings);
  const [tool, setTool] = useState<Tool>("move");
  const [brushSize, setBrushSize] = useState(70);
  const [hardness, setHardness] = useState(0.5);
  const [lassoMode, setLassoMode] = useState<BrushMode>("hide");
  const [lassoPts, setLassoPts] = useState<Point[]>([]);
  const [view, setView] = useState({ z: 1, panX: 0, panY: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [compare, setCompare] = useState(false);
  const [comparePos, setComparePos] = useState(0.5);
  const [peek, setPeek] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [maskReady, setMaskReady] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    composite.resultId ? "saved" : "idle",
  );
  const [exporting, setExporting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hist, setHist] = useState({ index: 0, length: 1 });

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const cursorRef = useRef<SVGCircleElement>(null);
  const cursorRingRef = useRef<SVGCircleElement>(null);
  const rubberRef = useRef<SVGLineElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const draggingQuality = useRef(false);
  const spaceRef = useRef(false);
  const cancelFrameRef = useRef<(() => void) | null>(null);
  const histRef = useRef<{ stack: Snap[]; index: number }>({ stack: [], index: -1 });
  const dirtyRef = useRef(!composite.resultId);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const initialMaskId = useState(() => composite.maskId)[0];
  const [previewCompositor] = useState(() => new Compositor());
  const [saveCompositor] = useState(() => new Compositor());
  const [exportCompositor] = useState(() => new Compositor());

  const stage = useMemo(() => {
    const pad = 28;
    const aw = Math.max(80, box.w - pad * 2);
    const ah = Math.max(80, box.h - pad * 2);
    const ar = work.width / work.height;
    let w = aw;
    let h = aw / ar;
    if (h > ah) {
      h = ah;
      w = ah * ar;
    }
    return { w, h };
  }, [box, work.width, work.height]);

  const latest = useLatest({ settings, wallImg, designImg, maskReady, box, stage, tool, brushSize, hardness, lassoMode, lassoPts, view, compare });
  const pxPerUnit = (stage.w * view.z) / work.width;
  const stageX = (box.w - stage.w) / 2 + view.panX;
  const stageY = (box.h - stage.h) / 2 + view.panY;

  /* ----------------------------- rendering ----------------------------- */

  const requestRender = useCallback(() => {
    if (cancelFrameRef.current) return;
    cancelFrameRef.current = scheduleFrame(() => {
      cancelFrameRef.current = null;
      const canvas = canvasRef.current;
      const l = latest();
      if (!canvas || !l.wallImg || !l.designImg || !l.maskReady) return;
      previewCompositor.render(canvas, {
        wall: l.wallImg,
        design: l.designImg,
        mask: maskRef.current,
        settings: l.settings,
        grid: draggingQuality.current ? 8 : 18,
      });
    });
  }, [latest, previewCompositor]);

  useEffect(() => {
    requestRender();
  }, [settings, wallImg, designImg, maskReady, requestRender]);

  useEffect(
    () => () => {
      cancelFrameRef.current?.();
      cancelFrameRef.current = null; // StrictMode re-runs effects: don't leave a dead "pending" marker
    },
    [],
  );

  /* ------------------------------ history ------------------------------ */

  const pushHistory = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) return;
    const h = histRef.current;
    const snap: Snap = {
      quad: cloneQuad(latest().settings.quad),
      alpha: snapshotMask(mask),
    };
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(snap);
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
    setHist({ index: h.index, length: h.stack.length });
  }, [latest]);

  /* ------------------------------ autosave ----------------------------- */

  const save = useCallback(async () => {
    const l = latest();
    const mask = maskRef.current;
    if (!l.wallImg || !l.designImg || !mask || !l.maskReady) return;
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    const store = useAppStore.getState();
    const current = store.composites[compositeId];
    if (!current) return;

    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const size = fitWithin(wall.width, wall.height, SAVE_MAX);
      const out = createCanvas(size.width, size.height);
      saveCompositor.render(out, {
        wall: l.wallImg,
        design: l.designImg,
        mask,
        settings: l.settings,
        grid: 24,
      });
      const [maskBlob, resultBlob, thumbBlob] = await Promise.all([
        canvasToBlob(mask, "image/png"),
        canvasToBlob(out, "image/jpeg", 0.9),
        makeThumb(out, out.width, out.height),
      ]);
      const maskId = current.maskId ?? newId("msk");
      const resultId = current.resultId ?? newId("res");
      const thumbId = current.thumbId ?? newId("thm");
      if (!useAppStore.getState().composites[compositeId]) return; // deleted meanwhile
      await Promise.all([
        putBlob(maskId, maskBlob),
        putBlob(resultId, resultBlob),
        putBlob(thumbId, thumbBlob),
      ]);
      useAppStore
        .getState()
        .updateComposite(compositeId, { settings: l.settings, maskId, resultId, thumbId });
      setSaveState(dirtyRef.current ? "idle" : "saved");
    } catch {
      dirtyRef.current = true;
      setSaveState("idle");
      toast.error("Couldn't save your changes. Is local storage full?");
    } finally {
      savingRef.current = false;
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        void save();
      }
    }
  }, [compositeId, latest, saveCompositor, wall.height, wall.width]);

  /** Debounced save. Safe to call from effects (touches no React state). */
  const armSaveTimer = useCallback(() => {
    dirtyRef.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 1200);
  }, [save]);

  /** Same, and flips the badge to "Unsaved". For use in event handlers. */
  const scheduleSave = useCallback(() => {
    setSaveState((s) => (s === "saving" ? s : "idle"));
    armSaveTimer();
  }, [armSaveTimer]);

  // Flush pending changes when leaving the studio.
  useEffect(
    () => () => {
      window.clearTimeout(saveTimer.current);
      if (dirtyRef.current) void save();
    },
    [save],
  );

  /* --------------------------- mask lifecycle -------------------------- */

  useEffect(() => {
    let cancelled = false;
    const mask = createMask(work.width, work.height);
    maskRef.current = mask;
    (async () => {
      if (initialMaskId) {
        try {
          const blob = await getBlob(initialMaskId);
          if (blob && !cancelled) {
            const img = await loadImage(blob);
            const ctx = mask.getContext("2d")!;
            ctx.clearRect(0, 0, mask.width, mask.height);
            ctx.drawImage(img, 0, 0, mask.width, mask.height);
          }
        } catch {
          /* fall back to a full mask */
        }
      }
      if (cancelled) return;
      histRef.current = {
        stack: [{ quad: cloneQuad(latest().settings.quad), alpha: snapshotMask(mask) }],
        index: 0,
      };
      setMaskReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [work.width, work.height, initialMaskId, latest]);

  // First open of a brand-new composition: render + store a result right away.
  const queuedInitialSave = useRef(false);
  useEffect(() => {
    if (queuedInitialSave.current || composite.resultId) return;
    if (maskReady && wallImg && designImg) {
      queuedInitialSave.current = true;
      armSaveTimer();
    }
  }, [maskReady, wallImg, designImg, composite.resultId, armSaveTimer]);

  // Swapping the design re-renders; persist the new look.
  const seenDesign = useRef(false);
  useEffect(() => {
    if (!designImg) return;
    if (!seenDesign.current) {
      seenDesign.current = true;
      return;
    }
    armSaveTimer();
  }, [designImg, armSaveTimer]);

  /* ------------------------------ viewport ----------------------------- */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const { box: b, stage: s } = latest();
        const z2 = clamp(v.z * factor, 0.2, 12);
        const k = z2 / v.z;
        const baseX = (b.w - s.w) / 2;
        const baseY = (b.h - s.h) / 2;
        const x = baseX + v.panX;
        const y = baseY + v.panY;
        return {
          z: z2,
          panX: cx - (cx - x) * k - baseX,
          panY: cy - (cy - y) * k - baseY,
        };
      });
    },
    [latest],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const fit = () => setView({ z: 1, panX: 0, panY: 0 });

  /* ------------------------------- actions ----------------------------- */

  const patch = useCallback(
    (p: Partial<CompositeSettings>) => {
      setSettings((s) => ({ ...s, ...p }));
      scheduleSave();
    },
    [scheduleSave],
  );

  const applySnap = useCallback(
    (snap: Snap) => {
      const mask = maskRef.current;
      if (mask) restoreMask(mask, snap.alpha);
      setSettings((s) => ({ ...s, quad: cloneQuad(snap.quad) }));
      scheduleSave();
      requestRender();
    },
    [requestRender, scheduleSave],
  );

  const undo = useCallback(() => {
    const h = histRef.current;
    if (h.index <= 0) return;
    h.index--;
    setHist({ index: h.index, length: h.stack.length });
    applySnap(h.stack[h.index]);
  }, [applySnap]);

  const redo = useCallback(() => {
    const h = histRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index++;
    setHist({ index: h.index, length: h.stack.length });
    applySnap(h.stack[h.index]);
  }, [applySnap]);

  const setQuad = useCallback(
    (quad: Quad) => {
      setSettings((s) => ({ ...s, quad }));
    },
    [],
  );

  const commitLasso = useCallback(
    (points: Point[]) => {
      const mask = maskRef.current;
      if (mask && points.length >= 3) {
        fillPolygon(mask, points, latest().lassoMode);
        pushHistory();
        scheduleSave();
        requestRender();
      }
      setLassoPts([]);
      rubberRef.current?.setAttribute("visibility", "hidden");
    },
    [latest, pushHistory, requestRender, scheduleSave],
  );

  const mutateMask = (fn: (m: HTMLCanvasElement) => void) => {
    const mask = maskRef.current;
    if (!mask) return;
    fn(mask);
    pushHistory();
    scheduleSave();
    requestRender();
  };

  const exportPng = async () => {
    const l = latest();
    if (!l.wallImg || !l.designImg || !maskRef.current) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 40)); // let the spinner paint
      const size = fitWithin(wall.width, wall.height, EXPORT_MAX);
      const out = createCanvas(size.width, size.height);
      exportCompositor.render(out, {
        wall: l.wallImg,
        design: l.designImg,
        mask: maskRef.current,
        settings: l.settings,
        grid: 30,
      });
      const blob = await canvasToBlob(out, "image/png");
      downloadBlob(blob, `${slugify(wall.name)}-${slugify(designLabel(design)).slice(0, 32)}.png`);
    } catch {
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  /* ------------------------------ keyboard ----------------------------- */

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          setSpaceDown(true);
        }
        return;
      }
      if (k === "v") setTool("move");
      else if (k === "e") setTool("erase");
      else if (k === "b") setTool("restore");
      else if (k === "l") setTool("lasso");
      else if (k === "h") setTool("hand");
      else if (k === "c") setCompare((c) => !c);
      else if (e.key === "\\") setPeek(true);
      else if (e.key === "[") setBrushSize((s) => clamp(Math.round(s * 0.85), 4, 400));
      else if (e.key === "]") setBrushSize((s) => clamp(Math.round(s * 1.18), 4, 400));
      else if (e.key === "Enter") commitLasso(latest().lassoPts);
      else if (e.key === "Escape") {
        setLassoPts([]);
        rubberRef.current?.setAttribute("visibility", "hidden");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceRef.current = false;
        setSpaceDown(false);
      } else if (e.key === "\\") setPeek(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [undo, redo, commitLasso, latest]);

  /* ------------------------------- pointer ----------------------------- */

  const toCanvas = (e: { clientX: number; clientY: number }): Point => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2 || !latest().maskReady) return;
    if (latest().compare) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const l = latest();
    const p = toCanvas(e);

    const startPan = () => {
      dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, panX: l.view.panX, panY: l.view.panY };
      setPanning(true);
    };

    if (e.button === 1 || l.tool === "hand" || spaceRef.current) return startPan();

    if (l.tool === "move") {
      const quadPx = l.settings.quad.map((q) => ({ x: q.x * work.width, y: q.y * work.height }));
      let best = -1;
      let bestD = HIT_PX / pxPerUnit;
      quadPx.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best >= 0) {
        draggingQuality.current = true;
        dragRef.current = { kind: "corner", index: best, moved: false };
      } else if (pointInQuad(p, quadPx)) {
        draggingQuality.current = true;
        dragRef.current = {
          kind: "quad",
          start: { x: p.x / work.width, y: p.y / work.height },
          orig: cloneQuad(l.settings.quad),
          moved: false,
        };
      } else startPan();
      return;
    }

    if (l.tool === "erase" || l.tool === "restore") {
      const mask = maskRef.current;
      if (!mask) return;
      const mode: BrushMode = l.tool === "erase" ? "hide" : "show";
      paintDot(mask, p, l.brushSize, l.hardness, mode);
      dragRef.current = { kind: "brush", last: p, mode };
      requestRender();
      return;
    }

    if (l.tool === "lasso") {
      const first = l.lassoPts[0];
      if (first && l.lassoPts.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) < HIT_PX / pxPerUnit) {
        commitLasso(l.lassoPts);
      } else {
        setLassoPts([...l.lassoPts, p]);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const l = latest();
    if (!l.maskReady) return;
    const p = toCanvas(e);
    const isBrush = l.tool === "erase" || l.tool === "restore";

    const cur = cursorRef.current;
    const ring = cursorRingRef.current;
    if (cur && ring) {
      const show = isBrush && !l.compare && !spaceRef.current;
      for (const c of [cur, ring]) {
        c.setAttribute("visibility", show ? "visible" : "hidden");
        c.setAttribute("cx", String(p.x));
        c.setAttribute("cy", String(p.y));
        c.setAttribute("r", String(l.brushSize / 2));
      }
    }
    const rubber = rubberRef.current;
    if (rubber && l.tool === "lasso" && l.lassoPts.length > 0) {
      const last = l.lassoPts[l.lassoPts.length - 1];
      rubber.setAttribute("x1", String(last.x));
      rubber.setAttribute("y1", String(last.y));
      rubber.setAttribute("x2", String(p.x));
      rubber.setAttribute("y2", String(p.y));
      rubber.setAttribute("visibility", "visible");
    }

    const d = dragRef.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.sx), panY: d.panY + (e.clientY - d.sy) }));
    } else if (d.kind === "corner") {
      d.moved = true;
      const next = cloneQuad(l.settings.quad);
      next[d.index] = {
        x: clamp(p.x / work.width, -0.5, 1.5),
        y: clamp(p.y / work.height, -0.5, 1.5),
      };
      setQuad(next);
    } else if (d.kind === "quad") {
      d.moved = true;
      const dx = p.x / work.width - d.start.x;
      const dy = p.y / work.height - d.start.y;
      setQuad(d.orig.map((q) => ({ x: q.x + dx, y: q.y + dy })) as Quad);
    } else if (d.kind === "brush") {
      const mask = maskRef.current;
      if (!mask) return;
      paintSegment(mask, d.last, p, l.brushSize, l.hardness, d.mode);
      d.last = p;
      requestRender();
    }
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    draggingQuality.current = false;
    setPanning(false);
    if (!d) return;
    if ((d.kind === "corner" || d.kind === "quad") && d.moved) {
      pushHistory();
      scheduleSave();
      requestRender();
    } else if (d.kind === "brush") {
      pushHistory();
      scheduleSave();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const q = settings.quad;
  const quadPts = q.map((p) => `${p.x * work.width},${p.y * work.height}`).join(" ");
  const canUndo = hist.index > 0;
  const canRedo = hist.index < hist.length - 1;
  const isBrush = tool === "erase" || tool === "restore";
  const showOverlay = !compare && !peek;
  const effectiveTool = spaceDown ? "hand" : tool;
  const cursor = !maskReady
    ? "progress"
    : compare
      ? "default"
      : panning
        ? "grabbing"
        : effectiveTool === "hand"
          ? "grab"
          : effectiveTool === "move"
            ? "default"
            : "crosshair";

  const inspector = (
    <StudioInspector
      projectId={projectId}
      settings={settings}
      onChange={patch}
      designs={readyDesigns}
      design={design}
      wallName={wall.name}
      onSwapDesign={(id) => updateComposite(compositeId, { designId: id })}
      onFitWall={() => {
        setQuad(fullWallQuad());
        pushHistory();
        scheduleSave();
      }}
      onResetPlacement={() => {
        setQuad(defaultQuad(wall.width / wall.height, design.width / design.height));
        pushHistory();
        scheduleSave();
      }}
      onInvertMask={() => mutateMask(invertMask)}
      onResetMask={() => mutateMask(resetMask)}
      onExport={exportPng}
      exporting={exporting}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Options bar */}
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background px-3 py-1.5">
        <div className="flex items-center">
          <IconBtn label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </IconBtn>
          <IconBtn label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </IconBtn>
        </div>
        <span className="h-5 w-px shrink-0 bg-border" />

        {isBrush && (
          <div className="flex shrink-0 items-center gap-4 text-xs">
            <label className="flex items-center gap-2">
              Size
              <Slider className="w-28" min={4} max={400} step={1} value={[brushSize]} onValueChange={([v]) => setBrushSize(v)} />
              <span className="w-8 text-muted-foreground tabular-nums">{brushSize}</span>
            </label>
            <label className="flex items-center gap-2">
              Hardness
              <Slider className="w-24" min={0} max={1} step={0.01} value={[hardness]} onValueChange={([v]) => setHardness(v)} />
              <span className="w-8 text-muted-foreground tabular-nums">{Math.round(hardness * 100)}%</span>
            </label>
          </div>
        )}
        {tool === "lasso" && (
          <div className="flex shrink-0 items-center gap-2 text-xs">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={lassoMode}
              onValueChange={(v) => v && setLassoMode(v as BrushMode)}
            >
              <ToggleGroupItem value="hide">Hide inside</ToggleGroupItem>
              <ToggleGroupItem value="show">Show inside</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" disabled={lassoPts.length < 3} onClick={() => commitLasso(lassoPts)}>
              <Check /> Apply
            </Button>
            <Button size="sm" variant="ghost" disabled={lassoPts.length === 0} onClick={() => setLassoPts([])}>
              <X /> Cancel
            </Button>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
          <SaveBadge state={saveState} />
          <span className="mx-1 h-5 w-px bg-border" />
          <IconBtn label="Zoom out" onClick={() => zoomAt(0.8, box.w / 2, box.h / 2)}>
            <ZoomOut />
          </IconBtn>
          <button
            type="button"
            onClick={fit}
            className="w-12 rounded-md py-1 text-center text-xs text-muted-foreground tabular-nums hover:bg-muted"
            title="Fit to screen"
          >
            {Math.round(view.z * 100)}%
          </button>
          <IconBtn label="Zoom in" onClick={() => zoomAt(1.25, box.w / 2, box.h / 2)}>
            <ZoomIn />
          </IconBtn>
          <IconBtn label="Fit to screen" onClick={fit}>
            <Maximize />
          </IconBtn>
          <span className="mx-1 h-5 w-px bg-border" />
          <IconBtn label="Before / after (C)" active={compare} onClick={() => setCompare((c) => !c)}>
            <Columns2 />
          </IconBtn>
          <IconBtn
            label="Hold to see the original wall (\)"
            active={peek}
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
          >
            <Eye />
          </IconBtn>
          <Button size="sm" variant="outline" className="ml-1 lg:hidden" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontal /> Adjust
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Tool rail */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
          {TOOLS.map((t) => (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant={tool === t.id ? "default" : "ghost"}
                  aria-label={t.label}
                  aria-pressed={tool === t.id}
                  onClick={() => setTool(t.id)}
                >
                  <t.icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t.label} <kbd className="ml-1 rounded border px-1 text-[10px]">{t.key}</kbd>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Canvas viewport */}
        <div
          ref={containerRef}
          className="bg-checker relative min-w-0 flex-1 touch-none overflow-hidden select-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            cursorRef.current?.setAttribute("visibility", "hidden");
            cursorRingRef.current?.setAttribute("visibility", "hidden");
          }}
          onDoubleClick={() => tool === "lasso" && commitLasso(latest().lassoPts)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="absolute top-0 left-0 origin-top-left shadow-2xl shadow-black/30"
            style={{
              width: stage.w,
              height: stage.h,
              transform: `translate(${stageX}px, ${stageY}px) scale(${view.z})`,
            }}
          >
            <canvas
              ref={canvasRef}
              width={work.width}
              height={work.height}
              className="block size-full bg-muted"
            />

            {(compare || peek) && wallUrl && (
              <img
                src={wallUrl}
                alt="Original wall"
                draggable={false}
                className="pointer-events-none absolute inset-0 size-full"
                style={{ clipPath: `inset(0 ${(1 - (peek ? 1 : comparePos)) * 100}% 0 0)` }}
              />
            )}
            {compare && !peek && (
              <CompareHandle pos={comparePos} onChange={setComparePos} canvasRef={canvasRef} />
            )}

            {showOverlay && (
              <svg
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
                viewBox={`0 0 ${work.width} ${work.height}`}
                preserveAspectRatio="none"
              >
                <polygon points={quadPts} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <polygon
                  points={quadPts}
                  fill="none"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeDasharray={tool === "move" ? undefined : "6 5"}
                  vectorEffect="non-scaling-stroke"
                />
                {tool === "move" &&
                  q.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x * work.width}
                      cy={p.y * work.height}
                      r={8 / pxPerUnit}
                      fill="white"
                      stroke="black"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                {lassoPts.length > 0 && (
                  <>
                    <polyline
                      points={lassoPts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={lassoMode === "hide" ? "rgba(255,60,60,0.18)" : "rgba(60,255,120,0.18)"}
                      stroke="white"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      vectorEffect="non-scaling-stroke"
                    />
                    {lassoPts.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={(i === 0 ? 6 : 3.5) / pxPerUnit}
                        fill={i === 0 ? "var(--primary)" : "white"}
                        stroke="black"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                  </>
                )}
                <line
                  ref={rubberRef}
                  visibility="hidden"
                  stroke="white"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  ref={cursorRingRef}
                  visibility="hidden"
                  fill="none"
                  stroke="black"
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  ref={cursorRef}
                  visibility="hidden"
                  fill="none"
                  stroke="white"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}
          </div>

          {!maskReady || !wallImg || !designImg ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          <p className="pointer-events-none absolute bottom-3 left-1/2 max-w-[92%] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs text-white backdrop-blur">
            {HINTS[tool]}
          </p>
        </div>

        <aside className="hidden w-80 shrink-0 border-l bg-background lg:block">{inspector}</aside>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[82svh] gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>Adjust composition</SheetTitle>
            <SheetDescription className="sr-only">Blend, colour and mask settings</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">{inspector}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ----------------------------- small pieces ---------------------------- */

function IconBtn({
  label,
  active,
  children,
  ...props
}: {
  label: string;
  active?: boolean;
} & React.ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant={active ? "secondary" : "ghost"}
          aria-label={label}
          aria-pressed={active}
          className={cn(active && "ring-1 ring-primary")}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SaveBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  return (
    <span className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground" aria-live="polite">
      {state === "saving" ? (
        <>
          <LoaderCircle className="size-3 animate-spin" /> Saving…
        </>
      ) : state === "saved" ? (
        <>
          <Check className="size-3 text-foreground" /> Saved
        </>
      ) : (
        <>Unsaved</>
      )}
    </span>
  );
}

function CompareHandle({
  pos,
  onChange,
  canvasRef,
}: {
  pos: number;
  onChange: (p: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  const update = (clientX: number) => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (r) onChange(clamp((clientX - r.left) / r.width, 0, 1));
  };
  return (
    <div
      role="slider"
      aria-label="Before and after position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      tabIndex={0}
      className="absolute inset-y-0 z-10 w-8 -translate-x-1/2 cursor-ew-resize touch-none outline-none"
      style={{ left: `${pos * 100}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onChange(clamp(pos - 0.02, 0, 1));
        if (e.key === "ArrowRight") onChange(clamp(pos + 0.02, 0, 1));
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]" />
      <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
        <Columns2 className="size-4" />
      </div>
      <span className="absolute top-3 right-full mr-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        Before
      </span>
      <span className="absolute top-3 left-full ml-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        After
      </span>
    </div>
  );
}
