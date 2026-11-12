import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceList } from "@/components/invoices/invoice-list";

export const metadata = { title: "Invoices" };

export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Finalized invoices are permanent. Corrections go through cancellation and replacement."
        actions={
          <Button asChild>
            <Link href="/admin/invoices/new">
              <FilePlus2 /> New invoice
            </Link>
          </Button>
        }
      />
      <InvoiceList role="admin" sp={await searchParams} />
    </div>
  );
}
