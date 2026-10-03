const rtf =
  typeof Intl !== "undefined"
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" })
    : null;

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(ts).toLocaleDateString();
  if (abs < 45_000) return "just now";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (abs < 2_592_000_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatArea(widthM?: number, heightM?: number): string | null {
  if (!widthM || !heightM) return null;
  return `${(widthM * heightM).toFixed(1)} m²`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function gcdRatio(w: number, h: number): string {
  const common: Array<[number, number]> = [
    [1, 1],
    [4, 3],
    [3, 2],
    [16, 9],
    [2, 1],
    [3, 4],
    [2, 3],
    [9, 16],
  ];
  const r = w / h;
  let best = common[0];
  let bestD = Infinity;
  for (const c of common) {
    const d = Math.abs(c[0] / c[1] - r);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return bestD < 0.06 ? `${best[0]}:${best[1]}` : `${r.toFixed(2)}:1`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "mural"
  );
}
