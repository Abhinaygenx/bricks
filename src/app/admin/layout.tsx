import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("admin");
  const settings = await getSettings();
  return (
    <AppShell role="admin" userName={me.full_name} userId={me.id} logoUrl={settings.logo_url}>
      {children}
    </AppShell>
  );
}
