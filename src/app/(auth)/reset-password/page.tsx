"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setError("Passwords do not match.");
    setBusy(true);
    const r = await updatePassword(pw);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(r.data);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="text-2xl font-bold text-charcoal">Choose a new password</h2>
      <FormError message={error} />
      <Field label="New password" hint="At least 10 characters with letters and numbers" htmlFor="pw">
        <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="Confirm password" htmlFor="pw2">
        <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={busy}>
        Save password
      </Button>
    </form>
  );
}
