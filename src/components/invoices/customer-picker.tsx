"use client";
import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { searchCustomers, type CustomerHit } from "@/actions/customers";
import { Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { CustomerCreateForm } from "@/components/customers/customer-form";
import { getCustomerHit } from "@/actions/customers";
import { inr, label } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CustomerPicker({
  value,
  onChange,
  isAdmin,
  disabled,
}: {
  value: CustomerHit | null;
  onChange: (c: CustomerHit | null) => void;
  isAdmin: boolean;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (term.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await searchCustomers(term);
        setHits(r);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [term]);

  if (value) {
    const over = value.credit_limit > 0 && value.balance > value.credit_limit;
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-brick/30 bg-brick-50/40 p-3">
        <div className="min-w-0">
          <p className="font-semibold text-charcoal">{value.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {value.mobile} · {value.customer_code} · {label(value.customer_type)}
          </p>
          {value.address && <p className="truncate text-sm text-muted-foreground">{value.address}</p>}
          <p className="mt-1 text-sm">
            Outstanding: <b className={value.balance > 0 ? "text-brick" : "text-emerald-700"}>{inr(value.balance)}</b>
            {value.credit_limit > 0 && <span className="text-muted-foreground"> · limit {inr(value.credit_limit)}</span>}
            {over && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-900">over limit</span>}
          </p>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-muted-foreground hover:bg-white" aria-label="Change customer">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    );
  }

  function pick(c: CustomerHit) {
    onChange(c);
    setTerm("");
    setHits([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            }
          }}
          placeholder="Search customer by name or mobile…"
          className="h-12 pl-9 text-base"
          autoComplete="off"
          disabled={disabled}
          aria-label="Search customer"
        />
      </div>
      {open && term.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>}
          {!loading && hits.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No match.</p>}
          {hits.map((c, i) => (
            <button
              type="button"
              key={c.id}
              onClick={() => pick(c)}
              className={cn("flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-beige-50", i === active && "bg-beige-50")}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.full_name}</span>
                <span className="text-xs text-muted-foreground">
                  {c.mobile} · {label(c.customer_type)}
                </span>
              </span>
              <span className={cn("text-sm font-semibold", c.balance > 0 ? "text-brick" : "text-muted-foreground")}>{inr(c.balance)}</span>
            </button>
          ))}
          <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-sm font-medium text-brick hover:bg-brick-50">
            <UserPlus className="h-4 w-4" /> Register new customer “{term.trim()}”
          </button>
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Register customer" className="sm:max-w-2xl">
        <CustomerCreateForm
          compact
          isAdmin={isAdmin}
          initialName={term.trim()}
          onCreated={async (id) => {
            setCreating(false);
            const c = await getCustomerHit(id);
            if (c) pick(c);
          }}
        />
      </Modal>
    </div>
  );
}
