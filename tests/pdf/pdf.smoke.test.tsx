// Renders every PDF template with sample data to make sure none of them throw.
//   npm run test:pdf
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceA4, ThermalInvoice, PaymentReceiptPdf, StatementPdf, ReportPdf } from "../../src/lib/pdf/documents";
import { DEFAULT_SETTINGS } from "../../src/lib/settings-defaults";

const settings = { ...DEFAULT_SETTINGS, address: "Main Road, Example Town", phone: "98400 00000", gstin: null };
const inv = {
  invoice_number: "VB/2026-27/000001", invoice_date: "2026-11-12", status: "finalized", dispatch_status: "dispatched",
  payment_method: "cash", payment_reference: null, subtotal: 20000, discount: 200, tax_label: null, tax_rate: 0, tax_amount: 0,
  grand_total: 19800, amount_paid: 8000, previous_outstanding: 6000, delivery_address: "Site 4", notes: null, staff_name: "Staff One",
  customer: { full_name: "Rajesh Construction", mobile: "9876543210", address: "Main Road", customer_code: "C00001" },
  items: [{ description: "First Class Bricks", quantity: 2500, unit_price: 8, line_total: 20000 }],
};
const isPdf = (b: Buffer) => b.subarray(0, 4).toString() === "%PDF" && b.length > 1000;

test("A4 invoice", async () => assert.ok(isPdf(await renderToBuffer(createElement(InvoiceA4, { inv, settings, logo: null }) as never))));
test("cancelled A4 invoice", async () => assert.ok(isPdf(await renderToBuffer(createElement(InvoiceA4, { inv: { ...inv, status: "cancelled" }, settings, logo: null }) as never))));
test("thermal receipt", async () => assert.ok(isPdf(await renderToBuffer(createElement(ThermalInvoice, { inv, settings }) as never))));
test("payment receipt", async () =>
  assert.ok(isPdf(await renderToBuffer(createElement(PaymentReceiptPdf, {
    r: { receipt_number: "RC/2026-27/000001", payment_date: "2026-11-12", amount: 8000, mode: "upi", reference: "UTR123", notes: null, kind: "payment", status: "active", received_by: "Staff One", customer: inv.customer, allocations: [{ invoice_number: inv.invoice_number, amount: 8000 }], balance_after: 12000 },
    settings, logo: null,
  }) as never))));
test("statement (multi-page)", async () =>
  assert.ok(isPdf(await renderToBuffer(createElement(StatementPdf, {
    st: { customer: { name: "Rajesh Construction", code: "C00001", mobile: "9876543210", address: null, credit_limit: 50000 }, from: "2026-11-01", to: "2026-11-30",
      opening_balance: 0, total_debits: 36000, total_credits: 10000, closing_balance: 26000,
      entries: Array.from({ length: 80 }, (_, i) => ({ date: "2026-11-05", description: `Invoice VB/2026-27/${String(i).padStart(6, "0")}`, debit: 100, credit: 0, balance: 100 * (i + 1) })) },
    settings, logo: null,
  }) as never))));
test("report", async () =>
  assert.ok(isPdf(await renderToBuffer(createElement(ReportPdf, {
    settings, title: "Daily Sales", subtitle: "01 Nov 2026 - 30 Nov 2026",
    columns: [{ key: "a", label: "Period" }, { key: "b", label: "Sales", align: "right" as const }], rows: [{ a: "01 Nov", b: "Rs. 1,000.00" }], summary: [["Total", "Rs. 1,000.00"]],
  }) as never))));
