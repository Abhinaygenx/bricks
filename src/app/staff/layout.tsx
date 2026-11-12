import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireRole("staff");
  const settings = await getSettings();
  return (
    <AppShell role="staff" userName={me.full_name} userId={me.id} logoUrl={settings.logo_url}>
      {children}
    </AppShell>
  );
}
