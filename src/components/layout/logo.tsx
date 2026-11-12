import { cn } from "@/lib/utils";

/** Text logo with a stacked-brick mark. Replaced by the uploaded logo when one is set. */
export function Logo({ logoUrl, className, dark = false, compact = false }: { logoUrl?: string | null; className?: string; dark?: boolean; compact?: boolean }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="Vabani Bricks" className={cn("h-9 w-auto object-contain", className)} />;
  }
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrickMark />
      {!compact && (
        <div className="leading-none">
          <div className={cn("text-[15px] font-extrabold tracking-[0.14em]", dark ? "text-white" : "text-charcoal")}>VABANI</div>
          <div className="mt-0.5 text-[10px] font-semibold tracking-[0.42em] text-brick">BRICKS</div>
        </div>
      )}
    </div>
  );
}

export function BrickMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#A63D2F" />
      <g fill="#F8F7F5">
        <rect x="6" y="8" width="9" height="4.5" rx="0.8" />
        <rect x="17" y="8" width="9" height="4.5" rx="0.8" />
        <rect x="6" y="14" width="4" height="4.5" rx="0.8" opacity="0.85" />
        <rect x="11.5" y="14" width="9" height="4.5" rx="0.8" opacity="0.85" />
        <rect x="22" y="14" width="4" height="4.5" rx="0.8" opacity="0.85" />
        <rect x="6" y="20" width="9" height="4.5" rx="0.8" opacity="0.7" />
        <rect x="17" y="20" width="9" height="4.5" rx="0.8" opacity="0.7" />
      </g>
    </svg>
  );
}
