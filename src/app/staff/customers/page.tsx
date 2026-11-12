import { PageHeader } from "@/components/layout/page-header";
import { CustomerList } from "@/components/customers/customer-list";
import { NewCustomerButton } from "@/components/customers/customer-form";

export const metadata = { title: "Customers" };

export default async function StaffCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Customers" actions={<NewCustomerButton isAdmin={false} basePath="/staff/customers" />} />
      <CustomerList basePath="/staff/customers" q={sp.q} type={sp.type} showLimit={false} />
    </div>
  );
}
