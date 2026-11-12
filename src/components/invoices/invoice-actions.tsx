"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, FilePlus2, Pencil, Trash2, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { cancelInvoiceNow, deleteDraft, dispatchInvoice, requestCancellation, reviewCancellation } from "@/actions/invoices";

export function DispatchButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [driver, setDriver] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError(null);
    const r = await dispatchInvoice(id, vehicle, driver, notes);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast("Marked as dispatched. Stock deducted.");
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary">
        <Truck /> Mark dispatched
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dispatch bricks" description="Stock is deducted once, permanently. This cannot be undone.">
        <div className="space-y-3">
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vehicle number">
              <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="TN 01 AB 1234" />
            </Field>
            <Field label="Driver name">
              <Input value={driver} onChange={(e) => setDriver(e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={go} loading={busy}>
              Confirm dispatch
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function CancelButton({ id, isAdmin, number }: { id: string; isAdmin: boolean; number: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError(null);
    const r = isAdmin ? await cancelInvoiceNow(id, reason) : await requestCancellation(id, reason);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast(isAdmin ? `Invoice ${number} cancelled` : "Cancellation request sent to the owner");
    setOpen(false);
    router.refresh();
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-destructive">
        <Ban /> {isAdmin ? "Cancel invoice" : "Request cancellation"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isAdmin ? `Cancel ${number}` : `Request cancellation of ${number}`}
        description={
          isAdmin
            ? "The invoice stays in history marked cancelled. Its amount is credited back to the customer, dispatched bricks are returned to stock, and payments stay as customer advance."
            : "The owner must approve. The invoice stays in history either way."
        }
      >
        <div className="space-y-3">
          <FormError message={error} />
          <Field label="Reason (required)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Wrong brick grade billed; customer wanted second class" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button variant="destructive" onClick={go} loading={busy} disabled={reason.trim().length < 5}>
              {isAdmin ? "Cancel invoice" : "Send request"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ReviewCancellationButtons({ cancellationId }: { cancellationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"a" | "r" | null>(null);
  async function act(approve: boolean) {
    const note = window.prompt(approve ? "Approval note (optional)" : "Why are you rejecting this request?") ?? null;
    if (note === null) return;
    if (!approve && !note.trim()) return;
    setBusy(approve ? "a" : "r");
    const r = await reviewCancellation(cancellationId, approve, note);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    toast(approve ? "Cancellation approved" : "Request rejected");
    router.refresh();
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="destructive" onClick={() => act(true)} loading={busy === "a"}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => act(false)} loading={busy === "r"}>
        <XCircle /> Reject
      </Button>
    </div>
  );
}

export function DraftActions({ id, editHref, listHref }: { id: string; editHref: string; listHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2">
      <Button asChild>
        <Link href={editHref}>
          <Pencil /> Continue editing
        </Link>
      </Button>
      <Button
        variant="outline"
        loading={busy}
        onClick={async () => {
          if (!confirm("Delete this draft? Drafts have no invoice number and no effect on stock or balances.")) return;
          setBusy(true);
          const r = await deleteDraft(id);
          setBusy(false);
          if (!r.ok) return toast(r.error, "error");
          toast("Draft deleted");
          router.push(listHref);
        }}
      >
        <Trash2 /> Delete draft
      </Button>
    </div>
  );
}

export function ReplacementLink({ href }: { href: string }) {
  return (
    <Button asChild variant="secondary">
      <Link href={href}>
        <FilePlus2 /> Create replacement invoice
      </Link>
    </Button>
  );
}
