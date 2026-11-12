import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border/70 bg-card text-card-foreground shadow-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2 md:p-5 md:pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold leading-tight text-charcoal", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0 md:p-5 md:pt-0", className)} {...props} />;
}

const tones = {
  neutral: "bg-muted text-charcoal",
  brick: "bg-brick-50 text-brick-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  dark: "bg-charcoal text-white",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

export function StatusBadge({ value }: { value: string }) {
  const map: Record<string, Tone> = {
    draft: "neutral", finalized: "blue", cancelled: "red", paid: "green", partial: "amber", unpaid: "red",
    pending: "amber", dispatched: "green", approved: "green", rejected: "red", active: "green", reversed: "red",
    reversal: "red", payment: "green", info: "neutral", warning: "amber", critical: "red",
  };
  return <Badge tone={map[value] ?? "neutral"}>{value.replace(/_/g, " ")}</Badge>;
}
