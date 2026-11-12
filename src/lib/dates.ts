export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "this_month" | "prev_month" | "custom";

export const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
  { value: "custom", label: "Custom Range" },
];

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * "Now" on the shop's calendar (IST), regardless of server/device timezone.
 * Vercel runs in UTC, so plain `new Date()` would be the previous day before 05:30 IST.
 */
export function istNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

export const todayIso = () => iso(istNow());

const isIso = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export type ResolvedRange = { preset: RangePreset; from: string; to: string };

export function resolveRange(sp: { range?: string; from?: string; to?: string }, fallback: RangePreset = "30d"): ResolvedRange {
  const now = istNow();
  const preset =(PRESETS.some((p) => p.value === sp.range) ? sp.range : fallback) as RangePreset;
  const d = (offset: number) => {
    const x = new Date(now);
    x.setDate(x.getDate() + offset);
    return iso(x);
  };
  switch (preset) {
    case "today":
      return { preset, from: d(0), to: d(0) };
    case "yesterday":
      return { preset, from: d(-1), to: d(-1) };
    case "7d":
      return { preset, from: d(-6), to: d(0) };
    case "this_month":
      return { preset, from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: d(0) };
    case "prev_month":
      return { preset, from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "custom": {
      const from = isIso(sp.from) ? sp.from! : d(-29);
      const to = isIso(sp.to) ? sp.to! : d(0);
      return from <= to ? { preset, from, to } : { preset, from: to, to: from };
    }
    default:
      return { preset: "30d", from: d(-29), to: d(0) };
  }
}

export function bucketFor(from: string, to: string): "day" | "week" | "month" {
  const days = (Date.parse(to) - Date.parse(from)) / 864e5;
  return days > 120 ? "month" : days > 45 ? "week" : "day";
}
