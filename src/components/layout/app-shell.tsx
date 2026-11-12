"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { ADMIN_NAV, STAFF_NAV } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { ConnectionStatus } from "./connection-status";
import { signOut } from "@/actions/auth";

type Props = {
  role: "admin" | "staff";
  userName: string;
  userId: string;
  logoUrl: string | null;
  children: React.ReactNode;
};

export function AppShell({ role, userName, userId, logoUrl, children }: Props) {
  const nav = role === "admin" ? ADMIN_NAV : STAFF_NAV;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Longest matching prefix wins, so /admin/invoices/new does not also light up /admin/invoices.
  const active = nav.map((n) => n.href).filter((h) => pathname === h || pathname.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];

  const links = (onClick?: () => void) =>
    nav.map((item) => {
      const Icon = item.icon;
      const isActive = active === item.href;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
            isActive ? "bg-brick text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
          {item.label}
        </Link>
      );
    });

  const footer = (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium text-white">{userName}</p>
        <p className="text-xs uppercase tracking-wide text-white/50">{role === "admin" ? "Owner / Admin" : "Staff"}</p>
      </div>
      <form action={signOut} onSubmit={() => navigator.serviceWorker?.controller?.postMessage("clear-pages")}>
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen md:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-charcoal md:flex">
        <div className="flex h-16 items-center px-5">
          <Logo logoUrl={logoUrl} dark />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">{links()}</nav>
        {footer}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-charcoal/60" />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-charcoal" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center justify-between px-5">
              <Logo logoUrl={logoUrl} dark />
              <button onClick={() => setOpen(false)} className="text-white/70" aria-label="Close menu">
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">{links(() => setOpen(false))}</nav>
            {footer}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/70 bg-white/90 px-4 backdrop-blur md:h-16 md:px-6">
        <button className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-6 w-6 text-charcoal" />
        </button>
        <div className="md:hidden">
          <Logo logoUrl={logoUrl} compact />
        </div>
        <div className="flex-1" />
        <ConnectionStatus />
        <NotificationBell userId={userId} href={role === "admin" ? "/admin/notifications" : null} />
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-4 md:px-6 md:pb-10 md:pt-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-white md:hidden">
        {nav
          .filter((n) => n.mobile)
          .map((item) => {
            const Icon = item.icon;
            const isActive = active === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-medium", isActive ? "text-brick" : "text-muted-foreground")}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label.replace("My ", "")}</span>
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
