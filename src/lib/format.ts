const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("en-IN");
const plain2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const inr = (v: number | string | null | undefined) => inrFmt.format(Number(v ?? 0));
export const inr0 = (v: number | string | null | undefined) => inrShort.format(Number(v ?? 0));
export const num = (v: number | string | null | undefined) => numFmt.format(Number(v ?? 0));
/** PDF variant: the built-in PDF fonts have no rupee glyph. */
export const rs = (v: number | string | null | undefined) => "Rs. " + plain2.format(Number(v ?? 0));

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const label = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUpi\b/g, "UPI").replace(/\bGst\b/g, "GST");

export const CUSTOMER_TYPES = [
  { value: "regular_credit", label: "Regular Credit" },
  { value: "cash", label: "Cash" },
  { value: "contractor", label: "Contractor" },
  { value: "dealer", label: "Dealer" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export const PAYMENT_TERMS = [
  { value: "immediate", label: "Immediate" },
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;
