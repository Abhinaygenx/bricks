"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { loginSchema } from "@/lib/validators";
import { signIn } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Logo } from "@/components/layout/logo";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(sp.get("error") === "inactive" ? "Your account is not active. Contact the owner." : null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setError(null);
    const r = await signIn({ ...values, next: sp.get("next") ?? undefined });
    if (!r.ok) return setError(r.error);
    router.replace(r.data);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-8 lg:hidden">
        <Logo />
      </div>
      <h2 className="text-2xl font-bold text-charcoal">Sign in</h2>
      <p className="mt-1 text-sm text-muted-foreground">Use the login given to you by the owner.</p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" error={form.formState.errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="username" inputMode="email" {...form.register("email")} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-brick hover:underline">
            Forgot password?
          </Link>
        </p>
      </form>
    </div>
  );
}
