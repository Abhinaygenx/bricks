import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";

/** `doc` is an element whose component renders a react-pdf <Document>. */
export async function pdfResponse(doc: ReactElement, filename: string, inline = false) {
  const buf = await renderToBuffer(doc as ReactElement<DocumentProps>);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Fetch the uploaded logo once per request; PDF still renders if it is unreachable. */
export async function loadLogo(url: string | null): Promise<Buffer | null> {
  if (!url || url.endsWith(".svg")) return null; // react-pdf cannot embed SVG files as images
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(url, { signal: ctrl.signal, cache: "force-cache" });
    clearTimeout(t);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export const jsonError = (message: string, status = 400) => Response.json({ error: message }, { status });
