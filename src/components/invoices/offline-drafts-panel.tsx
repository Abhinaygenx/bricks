"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { readDrafts, removeDraftLocal, type OfflineDraft } from "@/lib/offline-drafts";
import { saveInvoice } from "@/actions/invoices";
import { useOnline } from "@/components/layout/connection-status";
import { fmtDateTime, inr } from "@/lib/format";

/** Lists drafts saved on this device and syncs them to the server as drafts when online. */
export function OfflineDraftsPanel({ editBase, userId }: { editBase: string; userId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setDrafts(readDrafts(userId)), [userId]);
  useEffect(() => {
    refresh();
    window.addEventListener("vb-drafts-changed", refresh);
    return () => window.removeEventListener("vb-drafts-changed", refresh);
  }, [refresh]);

  const syncAll = useCallback(async () => {
    const list = readDrafts(userId);
    if (!list.length) return;
    setSyncing(true);
    let ok = 0;
    for (const d of list) {
      try {
        const r = await saveInvoice({ ...d.payload, finalize: false });
        if (r.ok) {
          removeDraftLocal(userId, d.key);
          ok++;
        } else {
          toast(`${d.customerName}: ${r.error}`, "error");
        }
      } catch {
        break; // still offline
      }
    }
    setSyncing(false);
    if (ok) {
      toast(`${ok} draft${ok > 1 ? "s" : ""} synced. Open them to finalize.`);
      router.refresh();
    }
  }, [router, userId]);

  useEffect(() => {
    if (online && readDrafts(userId).length) syncAll();
  }, [online, syncAll, userId]);

  if (!drafts.length) return null;
  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-amber-900">
          {drafts.length} invoice draft{drafts.length > 1 ? "s" : ""} saved on this device (not yet on the server)
        </p>
        <Button size="sm" onClick={syncAll} disabled={!online} loading={syncing}>
          <CloudUpload /> Sync now
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {drafts.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2 rounded bg-white/70 px-2 py-1.5">
            <span>
              {d.customerName} · {inr(d.total)} <span className="text-xs text-muted-foreground">· {fmtDateTime(d.savedAt)}</span>
            </span>
            <button
              className="text-muted-foreground hover:text-destructive"
              aria-label="Discard local draft"
              onClick={() => {
                if (confirm("Discard this local draft?")) removeDraftLocal(userId, d.key);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-900/80">Synced drafts appear under Drafts in {editBase.includes("admin") ? "Invoices" : "My Invoices"}.</p>
    </div>
  );
}
