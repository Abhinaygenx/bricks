import { PageHeader } from "@/components/layout/page-header";
import { CustomerList } from "@/components/customers/customer-list";
import { NewCustomerButton } from "@/components/customers/customer-form";

export const metadata = { title: "Customers" };

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Customers" description="Every customer has a permanent account ledger." actions={<NewCustomerButton isAdmin basePath="/admin/customers" />} />
      <CustomerList basePath="/admin/customers" q={sp.q} type={sp.type} showLimit />
    </div>
  );
}
