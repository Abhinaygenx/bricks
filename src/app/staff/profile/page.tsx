import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password";

export const metadata = { title: "Profile" };

export default async function StaffProfilePage() {
  const me = await requireRole("staff");
  const supabase = await createClient();
  const [{ data: sp }, settings] = await Promise.all([supabase.from("staff_profiles").select("*").eq("profile_id", me.id).maybeSingle(), getSettings()]);
  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="My profile" />
      <Card>
        <CardContent className="grid gap-3 pt-4 text-sm sm:grid-cols-2 md:pt-5">
          <Info k="Name" v={me.full_name} />
          <Info k="Login email" v={me.email ?? "-"} />
          <Info k="Phone" v={me.phone ?? "-"} />
          <Info k="Employee code" v={sp?.employee_code ?? "-"} />
          <Info k="Designation" v={sp?.designation ?? "-"} />
          <Info k="Joined" v={fmtDate(sp?.joined_on)} />
          <Info k="Discount you may give" v={`up to ${sp?.max_discount_percent ?? settings.staff_max_discount_percent}% of an invoice`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Every invoice and payment you record is saved with your name and time. Contact the owner to change your details.</p>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
      <p className="font-medium">{v}</p>
    </div>
  );
}
