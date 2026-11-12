import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { BusinessSettings } from "../settings-defaults";
import { fmtDate, label, num, rs } from "../format";

const BRICK = "#A63D2F";
const CHAR = "#252525";
const MUTED = "#6B6B6B";
const LINE = "#E2DBD0";
const BEIGE = "#F6F1E8";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: CHAR },
  row: { flexDirection: "row" },
  between: { flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: CHAR },
  tagline: { fontSize: 9, color: BRICK, marginTop: 2, letterSpacing: 1 },
  small: { fontSize: 8.5, color: MUTED },
  h: { fontFamily: "Helvetica-Bold" },
  docTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRICK, textAlign: "right" },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  th: { backgroundColor: CHAR, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 6 },
  td: { paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  stamp: { position: "absolute", top: 300, left: 120, fontSize: 64, color: "#C62828", opacity: 0.18, transform: "rotate(-25deg)", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7.5, color: MUTED, textAlign: "center" },
});

function Header({ settings, logo, title, meta }: { settings: BusinessSettings; logo: Buffer | null; title: string; meta: [string, string][] }) {
  return (
    <View style={[s.between, { borderBottomWidth: 2, borderBottomColor: BRICK, paddingBottom: 10, marginBottom: 14 }]}>
      <View style={[s.row, { gap: 10, maxWidth: 320 }]}>
        {logo && <Image src={logo} style={{ width: 52, height: 52, objectFit: "contain" }} />}
        <View>
          <Text style={s.brand}>{settings.business_name.toUpperCase()}</Text>
          <Text style={s.tagline}>{settings.tagline}</Text>
          {!!settings.address && <Text style={[s.small, { marginTop: 4 }]}>{settings.address}</Text>}
          <Text style={s.small}>
            {[settings.phone && `Ph: ${settings.phone}`, settings.email].filter(Boolean).join("  ·  ")}
          </Text>
          {!!settings.gstin && <Text style={s.small}>GSTIN: {settings.gstin}</Text>}
        </View>
      </View>
      <View>
        <Text style={s.docTitle}>{title}</Text>
        {meta.map(([k, v]) => (
          <Text key={k} style={[s.small, { textAlign: "right", marginTop: 2 }]}>
            {k}: <Text style={{ color: CHAR, fontFamily: "Helvetica-Bold" }}>{v}</Text>
          </Text>
        ))}
      </View>
    </View>
  );
}

function T({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={bold ? s.h : { color: MUTED }}>{k}</Text>
      <Text style={[bold ? s.h : {}, color ? { color } : {}]}>{v}</Text>
    </View>
  );
}

export type InvoicePdfData = {
  invoice_number: string;
  invoice_date: string;
  status: string;
  dispatch_status: string;
  payment_method: string;
  payment_reference: string | null;
  subtotal: number;
  discount: number;
  tax_label: string | null;
  tax_rate: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  previous_outstanding: number | null;
  delivery_address: string | null;
  notes: string | null;
  staff_name: string;
  customer: { full_name: string; mobile: string; address: string | null; customer_code: string };
  items: { description: string; quantity: number; unit_price: number; line_total: number }[];
};

export function InvoiceA4({ inv, settings, logo }: { inv: InvoicePdfData; settings: BusinessSettings; logo: Buffer | null }) {
  const balance = Number(inv.grand_total) - Number(inv.amount_paid);
  const prev = Number(inv.previous_outstanding ?? 0);
  return (
    <Document title={`Invoice ${inv.invoice_number}`} author={settings.business_name}>
      <Page size="A4" style={s.page}>
        {inv.status === "cancelled" && <Text style={s.stamp}>CANCELLED</Text>}
        <Header
          settings={settings}
          logo={logo}
          title={settings.tax_enabled && settings.gstin ? "TAX INVOICE" : "INVOICE"}
          meta={[
            ["Invoice No", inv.invoice_number],
            ["Date", fmtDate(inv.invoice_date)],
            ["Dispatch", label(inv.dispatch_status)],
          ]}
        />
        <View style={[s.row, { gap: 12, marginBottom: 14 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.small, { marginBottom: 3 }]}>BILL TO</Text>
            <Text style={[s.h, { fontSize: 11 }]}>{inv.customer.full_name}</Text>
            <Text>Mobile: {inv.customer.mobile}</Text>
            {!!inv.customer.address && <Text>{inv.customer.address}</Text>}
            <Text style={s.small}>Customer ID: {inv.customer.customer_code}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.small, { marginBottom: 3 }]}>DELIVER TO</Text>
            <Text>{inv.delivery_address || inv.customer.address || "-"}</Text>
          </View>
        </View>

        <View style={s.row}>
          <Text style={[s.th, { width: 28 }]}>#</Text>
          <Text style={[s.th, { flex: 1 }]}>Product description</Text>
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>Quantity</Text>
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>Unit price</Text>
          <Text style={[s.th, { width: 100, textAlign: "right" }]}>Total amount</Text>
        </View>
        {inv.items.map((it, i) => (
          <View key={i} style={[s.row, i % 2 ? { backgroundColor: BEIGE } : {}]}>
            <Text style={[s.td, { width: 28 }]}>{i + 1}</Text>
            <Text style={[s.td, { flex: 1 }]}>{it.description}</Text>
            <Text style={[s.td, { width: 80, textAlign: "right" }]}>{num(it.quantity)}</Text>
            <Text style={[s.td, { width: 80, textAlign: "right" }]}>{rs(it.unit_price)}</Text>
            <Text style={[s.td, { width: 100, textAlign: "right" }]}>{rs(it.line_total)}</Text>
          </View>
        ))}

        <View style={[s.row, { marginTop: 14, gap: 16 }]}>
          <View style={{ flex: 1 }}>
            <View style={[s.box, { backgroundColor: BEIGE, borderColor: BEIGE }]}>
              <T k="Previous outstanding balance" v={rs(prev)} />
              <T k="Current invoice amount" v={rs(inv.grand_total)} />
              <T k="Payment received" v={`- ${rs(inv.amount_paid)}`} />
              <View style={{ borderTopWidth: 1, borderTopColor: LINE, marginTop: 3, paddingTop: 3 }}>
                <T k="Total outstanding balance" v={rs(prev + balance)} bold color={BRICK} />
              </View>
            </View>
            <Text style={[s.small, { marginTop: 8 }]}>
              Payment method: {label(inv.payment_method)}
              {inv.payment_reference ? `  ·  Ref: ${inv.payment_reference}` : ""}
            </Text>
            {!!settings.upi_id && <Text style={s.small}>UPI: {settings.upi_id}</Text>}
            {!!settings.bank_details && <Text style={s.small}>Bank: {settings.bank_details}</Text>}
            {!!inv.notes && <Text style={[s.small, { marginTop: 4 }]}>Notes: {inv.notes}</Text>}
          </View>
          <View style={{ width: 210 }}>
            <T k="Subtotal" v={rs(inv.subtotal)} />
            {Number(inv.discount) > 0 && <T k="Discount" v={`- ${rs(inv.discount)}`} />}
            {Number(inv.tax_amount) > 0 && <T k={`${inv.tax_label} @ ${inv.tax_rate}%`} v={rs(inv.tax_amount)} />}
            <View style={{ borderTopWidth: 1.5, borderTopColor: CHAR, marginTop: 3, paddingTop: 3 }}>
              <T k="Grand total" v={rs(inv.grand_total)} bold />
            </View>
            <T k="Amount paid" v={rs(inv.amount_paid)} />
            <T k="Balance due on this invoice" v={rs(balance)} bold color={balance > 0 ? BRICK : undefined} />
          </View>
        </View>

        <View style={[s.between, { marginTop: 36, alignItems: "flex-end" }]}>
          <View style={{ maxWidth: 300 }}>
            {!!settings.invoice_terms && <Text style={s.small}>Terms: {settings.invoice_terms}</Text>}
            <Text style={[s.small, { marginTop: 4 }]}>Billed by: {inv.staff_name}</Text>
          </View>
          <View style={{ width: 170, alignItems: "center" }}>
            <View style={{ borderTopWidth: 1, borderTopColor: CHAR, width: "100%", marginTop: 30 }} />
            <Text style={[s.small, { marginTop: 3 }]}>Authorised signature</Text>
            <Text style={[s.small]}>for {settings.business_name}</Text>
          </View>
        </View>
        <Text style={s.footer} fixed>
          This is a computer-generated invoice. Invoice numbers are sequential and cannot be altered.
        </Text>
      </Page>
    </Document>
  );
}

const t = StyleSheet.create({
  page: { paddingHorizontal: 10, paddingVertical: 12, fontSize: 8, fontFamily: "Helvetica", color: "#000" },
  c: { textAlign: "center" },
  hr: { borderBottomWidth: 0.7, borderBottomColor: "#000", borderStyle: "dashed", marginVertical: 4 },
  r: { flexDirection: "row", justifyContent: "space-between" },
});

/** 80 mm thermal receipt (≈ 226pt wide), height grows with lines. */
export function ThermalInvoice({ inv, settings }: { inv: InvoicePdfData; settings: BusinessSettings }) {
  const balance = Number(inv.grand_total) - Number(inv.amount_paid);
  const prev = Number(inv.previous_outstanding ?? 0);
  const height = 330 + inv.items.length * 24;
  return (
    <Document title={`Receipt ${inv.invoice_number}`}>
      <Page size={[226, height]} style={t.page}>
        <Text style={[t.c, { fontSize: 12, fontFamily: "Helvetica-Bold" }]}>{settings.business_name.toUpperCase()}</Text>
        <Text style={t.c}>{settings.tagline}</Text>
        {!!settings.address && <Text style={t.c}>{settings.address}</Text>}
        {!!settings.phone && <Text style={t.c}>Ph: {settings.phone}</Text>}
        {!!settings.gstin && <Text style={t.c}>GSTIN: {settings.gstin}</Text>}
        <View style={t.hr} />
        <View style={t.r}>
          <Text>{inv.invoice_number}</Text>
          <Text>{fmtDate(inv.invoice_date)}</Text>
        </View>
        {inv.status === "cancelled" && <Text style={[t.c, { fontFamily: "Helvetica-Bold" }]}>*** CANCELLED ***</Text>}
        <Text>
          {inv.customer.full_name} · {inv.customer.mobile}
        </Text>
        <View style={t.hr} />
        {inv.items.map((it, i) => (
          <View key={i} style={{ marginBottom: 3 }}>
            <Text>{it.description}</Text>
            <View style={t.r}>
              <Text>
                {num(it.quantity)} x {rs(it.unit_price)}
              </Text>
              <Text>{rs(it.line_total)}</Text>
            </View>
          </View>
        ))}
        <View style={t.hr} />
        <View style={t.r}>
          <Text>Subtotal</Text>
          <Text>{rs(inv.subtotal)}</Text>
        </View>
        {Number(inv.discount) > 0 && (
          <View style={t.r}>
            <Text>Discount</Text>
            <Text>-{rs(inv.discount)}</Text>
          </View>
        )}
        {Number(inv.tax_amount) > 0 && (
          <View style={t.r}>
            <Text>
              {inv.tax_label} {inv.tax_rate}%
            </Text>
            <Text>{rs(inv.tax_amount)}</Text>
          </View>
        )}
        <View style={t.r}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>TOTAL</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{rs(inv.grand_total)}</Text>
        </View>
        <View style={t.r}>
          <Text>Paid ({label(inv.payment_method)})</Text>
          <Text>{rs(inv.amount_paid)}</Text>
        </View>
        <View style={t.r}>
          <Text>Balance</Text>
          <Text>{rs(balance)}</Text>
        </View>
        <View style={t.hr} />
        <View style={t.r}>
          <Text>Previous outstanding</Text>
          <Text>{rs(prev)}</Text>
        </View>
        <View style={t.r}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Total outstanding</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{rs(prev + balance)}</Text>
        </View>
        <View style={t.hr} />
        <Text style={t.c}>Billed by {inv.staff_name}</Text>
        <Text style={t.c}>Thank you!</Text>
      </Page>
    </Document>
  );
}

export type ReceiptPdfData = {
  receipt_number: string;
  payment_date: string;
  amount: number;
  mode: string;
  reference: string | null;
  notes: string | null;
  kind: string;
  status: string;
  received_by: string;
  customer: { full_name: string; mobile: string; customer_code: string; address: string | null };
  allocations: { invoice_number: string; amount: number }[];
  balance_after: number;
};

export function PaymentReceiptPdf({ r, settings, logo }: { r: ReceiptPdfData; settings: BusinessSettings; logo: Buffer | null }) {
  return (
    <Document title={`Receipt ${r.receipt_number}`}>
      <Page size="A5" orientation="landscape" style={s.page}>
        {r.status === "reversed" && <Text style={[s.stamp, { top: 140, left: 140, fontSize: 52 }]}>REVERSED</Text>}
        <Header
          settings={settings}
          logo={logo}
          title={r.kind === "reversal" ? "PAYMENT REVERSAL" : "PAYMENT RECEIPT"}
          meta={[
            ["Receipt No", r.receipt_number],
            ["Date", fmtDate(r.payment_date)],
          ]}
        />
        <Text style={{ fontSize: 11, lineHeight: 1.6 }}>
          {r.kind === "reversal" ? "Reversed payment for " : "Received with thanks from "}
          <Text style={s.h}>{r.customer.full_name}</Text> ({r.customer.mobile}, {r.customer.customer_code}) the sum of{" "}
          <Text style={[s.h, { color: BRICK }]}>{rs(Math.abs(Number(r.amount)))}</Text> by {label(r.mode)}
          {r.reference ? ` (ref ${r.reference})` : ""}.
        </Text>
        {r.allocations.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={[s.small, { marginBottom: 3 }]}>APPLIED TO</Text>
            {r.allocations.map((a, i) => (
              <View key={i} style={[s.between, { maxWidth: 300 }]}>
                <Text>{a.invoice_number}</Text>
                <Text>{rs(a.amount)}</Text>
              </View>
            ))}
          </View>
        )}
        {!!r.notes && <Text style={[s.small, { marginTop: 6 }]}>Notes: {r.notes}</Text>}
        <View style={[s.between, { marginTop: 24, alignItems: "flex-end" }]}>
          <View>
            <Text>
              Current outstanding balance: <Text style={s.h}>{rs(r.balance_after)}</Text>
            </Text>
            <Text style={s.small}>Received by: {r.received_by}</Text>
          </View>
          <View style={{ width: 150, alignItems: "center" }}>
            <View style={{ borderTopWidth: 1, borderTopColor: CHAR, width: "100%", marginTop: 24 }} />
            <Text style={s.small}>Authorised signature</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export type StatementPdfData = {
  customer: { name: string; code: string; mobile: string; address: string | null; credit_limit: number };
  from: string;
  to: string;
  opening_balance: number;
  total_debits: number;
  total_credits: number;
  closing_balance: number;
  entries: { date: string; description: string; debit: number; credit: number; balance: number }[];
};

export function StatementPdf({ st, settings, logo }: { st: StatementPdfData; settings: BusinessSettings; logo: Buffer | null }) {
  return (
    <Document title={`Statement ${st.customer.name}`}>
      <Page size="A4" style={s.page}>
        <Header
          settings={settings}
          logo={logo}
          title="ACCOUNT STATEMENT"
          meta={[
            ["Period", `${fmtDate(st.from)} - ${fmtDate(st.to)}`],
            ["Generated", fmtDate(new Date())],
          ]}
        />
        <View style={[s.box, { marginBottom: 12 }]}>
          <Text style={[s.h, { fontSize: 11 }]}>{st.customer.name}</Text>
          <Text>
            {st.customer.mobile} · Customer ID {st.customer.code}
          </Text>
          {!!st.customer.address && <Text>{st.customer.address}</Text>}
        </View>
        <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
          {[
            ["Previous balance", st.opening_balance],
            ["Total purchases", st.total_debits],
            ["Total payments", st.total_credits],
            ["Closing balance", st.closing_balance],
          ].map(([k, v], i) => (
            <View key={i} style={[s.box, { flex: 1, backgroundColor: i === 3 ? "#FBF1EF" : BEIGE, borderColor: i === 3 ? BRICK : BEIGE }]}>
              <Text style={s.small}>{k as string}</Text>
              <Text style={[s.h, { fontSize: 11, marginTop: 2, color: i === 3 ? BRICK : CHAR }]}>{rs(v as number)}</Text>
            </View>
          ))}
        </View>
        <View style={s.row} fixed>
          <Text style={[s.th, { width: 64 }]}>Date</Text>
          <Text style={[s.th, { flex: 1 }]}>Description</Text>
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>Debit</Text>
          <Text style={[s.th, { width: 80, textAlign: "right" }]}>Credit</Text>
          <Text style={[s.th, { width: 86, textAlign: "right" }]}>Balance</Text>
        </View>
        <View style={[s.row, { backgroundColor: BEIGE }]}>
          <Text style={[s.td, { width: 64 }]}>{fmtDate(st.from)}</Text>
          <Text style={[s.td, { flex: 1, fontFamily: "Helvetica-Oblique" }]}>Balance brought forward</Text>
          <Text style={[s.td, { width: 80 }]} />
          <Text style={[s.td, { width: 80 }]} />
          <Text style={[s.td, { width: 86, textAlign: "right" }]}>{rs(st.opening_balance)}</Text>
        </View>
        {st.entries.map((e, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={[s.td, { width: 64 }]}>{fmtDate(e.date)}</Text>
            <Text style={[s.td, { flex: 1 }]}>{e.description}</Text>
            <Text style={[s.td, { width: 80, textAlign: "right" }]}>{Number(e.debit) ? rs(e.debit) : ""}</Text>
            <Text style={[s.td, { width: 80, textAlign: "right" }]}>{Number(e.credit) ? rs(e.credit) : ""}</Text>
            <Text style={[s.td, { width: 86, textAlign: "right" }]}>{rs(e.balance)}</Text>
          </View>
        ))}
        <View style={[s.between, { marginTop: 10 }]}>
          <Text style={s.small}>Debit = purchases / amounts due. Credit = payments / cancellations.</Text>
          <Text style={[s.h, { color: BRICK }]}>Closing balance: {rs(st.closing_balance)}</Text>
        </View>
        {!!settings.upi_id && <Text style={[s.small, { marginTop: 8 }]}>Pay by UPI: {settings.upi_id}</Text>}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${settings.business_name} · Statement for ${st.customer.name} · Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}

export function ReportPdf({
  settings,
  title,
  subtitle,
  columns,
  rows,
  summary,
}: {
  settings: BusinessSettings;
  title: string;
  subtitle: string;
  columns: { key: string; label: string; align?: "right"; width?: number }[];
  rows: Record<string, string>[];
  summary?: [string, string][];
}) {
  const landscape = columns.length > 6;
  return (
    <Document title={title}>
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={[s.page, { fontSize: 8 }]}>
        <Header settings={settings} logo={null} title={title.toUpperCase()} meta={[["Period", subtitle], ["Generated", fmtDate(new Date())]]} />
        {summary && summary.length > 0 && (
          <View style={[s.row, { gap: 8, marginBottom: 10, flexWrap: "wrap" }]}>
            {summary.map(([k, v]) => (
              <View key={k} style={[s.box, { minWidth: 110, backgroundColor: BEIGE, borderColor: BEIGE }]}>
                <Text style={s.small}>{k}</Text>
                <Text style={[s.h, { fontSize: 10 }]}>{v}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={s.row} fixed>
          {columns.map((c) => (
            <Text key={c.key} style={[s.th, c.width ? { width: c.width } : { flex: 1 }, c.align === "right" ? { textAlign: "right" } : {}]}>
              {c.label}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[s.row, i % 2 ? { backgroundColor: BEIGE } : {}]} wrap={false}>
            {columns.map((c) => (
              <Text key={c.key} style={[s.td, c.width ? { width: c.width } : { flex: 1 }, c.align === "right" ? { textAlign: "right" } : {}]}>
                {r[c.key] ?? ""}
              </Text>
            ))}
          </View>
        ))}
        {rows.length === 0 && <Text style={{ marginTop: 10, color: MUTED }}>No records for this period.</Text>}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${settings.business_name} · ${title} · Page ${pageNumber} of ${totalPages}`} />
      </Page>
    </Document>
  );
}
