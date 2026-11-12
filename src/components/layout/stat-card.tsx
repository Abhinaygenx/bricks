import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "brick" | "warn" | "good";
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "h-full rounded-lg border border-border/70 bg-white p-4 shadow-card transition-shadow",
        href && "hover:shadow-md",
        tone === "brick" && "border-brick/20 bg-brick-50/50",
        tone === "warn" && "border-amber-300 bg-amber-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn("h-4 w-4", tone === "brick" ? "text-brick" : tone === "warn" ? "text-amber-700" : "text-muted-foreground")} />}
      </div>
      <p className={cn("mt-2 text-xl font-bold tabular-nums text-charcoal md:text-2xl", tone === "good" && "text-emerald-700")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
