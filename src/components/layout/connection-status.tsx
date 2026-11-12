"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function ConnectionStatus() {
  const online = useOnline();
  if (online) {
    return (
      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> Online
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
      <WifiOff className="h-3.5 w-3.5" /> Offline - drafts save on this device
    </span>
  );
}
