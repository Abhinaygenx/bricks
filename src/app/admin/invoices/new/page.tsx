import { NewInvoicePage } from "@/components/invoices/new-invoice-page";

export const metadata = { title: "New Invoice" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <NewInvoicePage role="admin" sp={await searchParams} />;
}
