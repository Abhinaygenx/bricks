"use client";
import type { InvoiceInput } from "@/lib/validators";

/**
 * Invoice drafts saved on the device while offline. They are only ever synced
 * to the server as DRAFTS (finalize: false) using their idempotency key, so a
 * retry can never create a second invoice, and nothing is finalized without a
 * live server confirmation. Drafts are stored per user, so on a shared phone
 * one employee's drafts are never synced under another employee's login.
 */
export type OfflineDraft = {
  key: string; // idempotency key
  savedAt: string;
  customerName: string;
  total: number;
  payload: Omit<InvoiceInput, "finalize">;
};

const store = (userId: string) => `vb-offline-invoice-drafts:${userId}`;

export function readDrafts(userId: string): OfflineDraft[] {
  try {
    return JSON.parse(localStorage.getItem(store(userId)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveDraftLocal(userId: string, d: OfflineDraft) {
  const all = readDrafts(userId).filter((x) => x.key !== d.key);
  all.unshift(d);
  localStorage.setItem(store(userId), JSON.stringify(all.slice(0, 50)));
  window.dispatchEvent(new Event("vb-drafts-changed"));
}

export function removeDraftLocal(userId: string, key: string) {
  localStorage.setItem(store(userId), JSON.stringify(readDrafts(userId).filter((x) => x.key !== key)));
  window.dispatchEvent(new Event("vb-drafts-changed"));
}
