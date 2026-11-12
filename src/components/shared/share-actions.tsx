"use client";
import { useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/**
 * Download / print / share a server-generated PDF. On phones the PDF file
 * itself is shared (WhatsApp appears in the share sheet). On desktop it
 * falls back to a WhatsApp message with the summary; the PDF is downloaded
 * so it can be attached.
 */
export function ShareActions({
  pdfUrl,
  filename,
  whatsappText,
  phone,
  extra,
}: {
  pdfUrl: string;
  filename: string;
  whatsappText: string;
  phone?: string | null;
  extra?: { label: string; url: string }[];
}) {
  const [busy, setBusy] = useState(false);

  async function fetchPdf() {
    const res = await fetch(pdfUrl, { credentials: "same-origin" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not create PDF");
    return res.blob();
  }

  async function download(url = pdfUrl, name = filename) {
    try {
      setBusy(true);
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not create PDF");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function print() {
    const w = window.open(pdfUrl + (pdfUrl.includes("?") ? "&" : "?") + "inline=1", "_blank");
    if (!w) toast("Allow pop-ups to print", "error");
  }

  async function share() {
    try {
      setBusy(true);
      const blob = await fetchPdf();
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename, text: whatsappText });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      const to = phone ? `91${phone.replace(/\D/g, "").slice(-10)}` : "";
      window.open(`https://wa.me/${to}?text=${encodeURIComponent(whatsappText)}`, "_blank", "noopener");
      toast("PDF downloaded - attach it in WhatsApp");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => download()} disabled={busy}>
        <Download /> PDF
      </Button>
      {extra?.map((x) => (
        <Button key={x.url} variant="outline" onClick={() => download(x.url, filename.replace(".pdf", `-${x.label.toLowerCase()}.pdf`))} disabled={busy}>
          <Download /> {x.label}
        </Button>
      ))}
      <Button variant="outline" onClick={print}>
        <Printer /> Print
      </Button>
      <Button onClick={share} loading={busy} className="bg-[#1f8f4e] hover:bg-[#187540]">
        <Share2 /> WhatsApp
      </Button>
    </div>
  );
}
