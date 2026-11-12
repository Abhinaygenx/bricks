import { InvoiceDetail } from "@/components/invoices/invoice-detail";

export const metadata = { title: "Invoice" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <InvoiceDetail id={id} role="admin" isNew={sp.new === "1"} />;
}
