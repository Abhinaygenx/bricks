"use client";
import { useState } from "react";
import { updatePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";

export function ChangePasswordForm() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (pw !== pw2) return setError("Passwords do not match.");
        setBusy(true);
        const r = await updatePassword(pw);
        setBusy(false);
        if (!r.ok) return setError(r.error);
        setPw("");
        setPw2("");
        toast("Password changed");
      }}
    >
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New password" hint="10+ characters, letters and numbers">
          <Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Confirm">
          <Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" loading={busy}>
        Update password
      </Button>
    </form>
  );
}
