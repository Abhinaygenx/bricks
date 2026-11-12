"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PRESETS, type RangePreset } from "@/lib/dates";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function DateRangeFilter({ preset, from, to }: { preset: RangePreset; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [p, setP] = useState<RangePreset>(preset);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);

  function apply(next: RangePreset, nf = f, nt = t) {
    const params = new URLSearchParams(sp.toString());
    params.set("range", next);
    if (next === "custom") {
      params.set("from", nf);
      params.set("to", nt);
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Select
        aria-label="Date range"
        value={p}
        onChange={(e) => {
          const v = e.target.value as RangePreset;
          setP(v);
          if (v !== "custom") apply(v);
        }}
        className="w-auto min-w-40"
      >
        {PRESETS.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </Select>
      {p === "custom" && (
        <>
          <Input type="date" value={f} max={t} onChange={(e) => setF(e.target.value)} className="w-auto" aria-label="From" />
          <Input type="date" value={t} min={f} onChange={(e) => setT(e.target.value)} className="w-auto" aria-label="To" />
          <Button variant="secondary" onClick={() => apply("custom", f, t)}>
            Apply
          </Button>
        </>
      )}
    </div>
  );
}
