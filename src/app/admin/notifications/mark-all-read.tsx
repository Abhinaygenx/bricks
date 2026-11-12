"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "@/actions/notifications";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await markNotificationsRead();
        setBusy(false);
        router.refresh();
      }}
    >
      <CheckCheck /> Mark all read
    </Button>
  );
}
