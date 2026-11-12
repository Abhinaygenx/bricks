import { PaymentsPage } from "@/components/payments/payments-page";

export const metadata = { title: "Payments" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <PaymentsPage role="admin" sp={await searchParams} />;
}
