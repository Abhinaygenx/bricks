import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-charcoal">
            <ChevronLeft className="h-4 w-4" /> Back
          </Link>
        )}
        <h1 className="truncate text-xl font-bold tracking-tight text-charcoal md:text-2xl">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            current === t.key ? "border-brick text-brick" : "border-transparent text-muted-foreground hover:text-charcoal",
          )}
        >
          {t.label}
          {t.count ? <span className="rounded-full bg-brick px-1.5 text-[10px] font-bold text-white">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
