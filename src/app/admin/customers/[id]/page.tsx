import { CustomerProfile } from "@/components/customers/customer-profile";

export const metadata = { title: "Customer" };

export default async function AdminCustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <CustomerProfile id={id} role="admin" sp={sp} />;
}
