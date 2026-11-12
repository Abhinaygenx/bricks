"use client";
import Link from "next/link";
import { useState } from "react";
import { requestPasswordReset } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await requestPasswordReset(email);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setSent(true);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Reset password</h2>
      {sent ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">If an account exists for {email}, a reset link has been sent. Check your inbox.</p>
          <Link href="/login" className="text-sm text-brick hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">Enter your login email and we will send a reset link.</p>
          <FormError message={error} />
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>
            Send reset link
          </Button>
          <p className="text-center text-sm">
            <Link href="/login" className="text-brick hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
