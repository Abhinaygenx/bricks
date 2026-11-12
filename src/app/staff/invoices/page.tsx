import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InvoiceList } from "@/components/invoices/invoice-list";

export const metadata = { title: "My Invoices" };

export default async function StaffInvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <div>
      <PageHeader
        title="My Invoices"
        actions={
          <Button asChild>
            <Link href="/staff/new-invoice">
              <FilePlus2 /> New invoice
            </Link>
          </Button>
        }
      />
      <InvoiceList role="staff" sp={await searchParams} />
    </div>
  );
}
