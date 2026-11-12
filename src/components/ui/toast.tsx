"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

type ToastItem = { id: number; message: string; kind: "success" | "error" };
const EVENT = "vb-toast";

export function toast(message: string, kind: ToastItem["kind"] = "success") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    const onToast = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems((s) => [...s, { id, message, kind }]);
      setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg bg-charcoal px-4 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          {t.kind === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
