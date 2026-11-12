import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult<never> => ({ ok: false, error, fieldErrors });

export function zodFail(err: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fail(err.issues[0]?.message ?? "Invalid input", fieldErrors);
}

/**
 * Turns a database refusal into a friendly message. Refusals with SQLSTATE
 * VB403 (permission / business rule) or 42501 (privilege) are written to the
 * audit log as security events in a separate call, because the refused
 * transaction itself was rolled back.
 */
export async function dbFail(error: PostgrestError, action: string, details: Record<string, unknown> = {}): Promise<ActionResult<never>> {
  const message = cleanMessage(error.message);
  if (error.code === "VB403" || error.code === "42501") {
    try {
      const supabase = await createClient();
      await supabase.rpc("log_security_event", { p_action: action, p_details: { ...details, message, code: error.code } });
    } catch {
      /* never block the response on logging */
    }
  }
  if (error.code === "23505") return fail("This record already exists (duplicate).");
  if (error.code === "23514") return fail("The values entered break a business rule: " + message);
  return fail(message);
}

function cleanMessage(m: string) {
  return m.replace(/^ERROR:\s*/i, "").trim() || "Something went wrong";
}

/** Parse a FormData / object with a zod schema. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): { data: z.infer<S> } | { error: ActionResult<never> } {
  const r = schema.safeParse(input);
  return r.success ? { data: r.data } : { error: zodFail(r.error) };
}
