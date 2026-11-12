import { z } from "zod";

// Shared between client forms (React Hook Form) and server actions.
// The database re-checks everything that matters; these give fast feedback.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const money = z.coerce.number({ invalid_type_error: "Enter an amount" }).min(0, "Cannot be negative").max(100_000_000, "Too large");
const optText = (max = 500) => z.string().trim().max(max).optional().or(z.literal("")).transform((v) => (v ? v : null));

export const mobileSchema = z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password is too short"),
});

export const productSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "2-20 letters, digits or dashes"),
  name: z.string().trim().min(2, "Name is required").max(120),
  description: optText(500),
  unit: z.string().trim().min(1).max(20).default("brick"),
  selling_price: money,
  cost_price: z.union([money, z.literal("").transform(() => null)]).nullable().optional(),
  min_stock_level: z.coerce.number().int().min(0),
  opening_stock: z.coerce.number().int().min(0).default(0),
  is_active: z.coerce.boolean().default(true),
  reason: optText(300),
});

export const productionSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  production_date: isoDate,
  quantity: z.coerce.number().int().positive("Must be more than 0").max(10_000_000),
  batch_number: z.string().trim().min(1, "Batch number is required").max(40),
  production_cost: z.union([money, z.literal("").transform(() => null)]).nullable().optional(),
  notes: optText(500),
});

export const incomingSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  quantity: z.coerce.number().int().positive("Must be more than 0").max(10_000_000),
  source: z.string().trim().min(2, "Source is required").max(120),
  date: isoDate,
  reason: optText(300),
});

export const stockChangeSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  kind: z.enum(["damage", "adjustment"]),
  quantity: z.coerce.number().int().min(0).max(10_000_000),
  reason: z.string().trim().min(3, "Reason is required").max(300),
  notes: optText(500),
});

export const customerSchema = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(120),
  mobile: mobileSchema,
  alt_mobile: z.string().trim().regex(/^$|^[6-9]\d{9}$/, "Invalid mobile").optional(),
  address: optText(300),
  customer_type: z.enum(["regular_credit", "cash", "contractor", "dealer", "other"]),
  opening_balance: z.coerce.number().min(-100_000_000).max(100_000_000).default(0),
  credit_limit: money.default(0),
  payment_terms: z.enum(["immediate", "weekly", "fortnightly", "monthly"]),
  notes: optText(500),
});

export const customerUpdateSchema = customerSchema.omit({ opening_balance: true }).extend({
  id: z.string().uuid(),
  is_active: z.coerce.boolean(),
  reason: optText(300),
});

export const invoiceItemSchema = z.object({
  product_id: z.string().uuid("Select a brick type"),
  quantity: z.coerce.number().int().positive("Qty > 0").max(10_000_000),
  unit_price: z.coerce.number().min(0).optional(),
});

export const invoiceSchema = z.object({
  draft_id: z.string().uuid().optional().nullable(),
  idempotency_key: z.string().uuid(),
  customer_id: z.string().uuid("Select a customer"),
  invoice_date: isoDate,
  items: z.array(invoiceItemSchema).min(1, "Add at least one item").max(50),
  discount: money.default(0),
  payment_method: z.enum(["cash", "upi", "bank_transfer", "cheque", "credit", "other"]),
  amount_paid: money.default(0),
  payment_reference: z.string().trim().max(80).optional().nullable(),
  delivery_address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  finalize: z.boolean(),
  dispatch_now: z.boolean().default(false),
  vehicle_number: z.string().trim().max(20).optional().nullable(),
  driver_name: z.string().trim().max(60).optional().nullable(),
  replaces_invoice_id: z.string().uuid().optional().nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  customer_id: z.string().uuid("Select a customer"),
  amount: z.coerce.number().positive("Enter an amount").max(100_000_000),
  payment_date: isoDate,
  mode: z.enum(["cash", "upi", "bank_transfer", "cheque", "other"]),
  reference: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount: z.coerce.number().min(0) })).optional().nullable(),
  idempotency_key: z.string().uuid(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const reasonSchema = z.string().trim().min(5, "Give a clear reason (at least 5 characters)").max(500);

export const staffCreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/^$|^[6-9]\d{9}$/, "Invalid mobile").optional(),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .regex(/[A-Za-z]/, "Include a letter")
    .regex(/\d/, "Include a number"),
  employee_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/, "2-20 letters/digits"),
  designation: z.string().trim().max(60).optional(),
  max_discount_percent: z.union([z.coerce.number().min(0).max(100), z.literal("").transform(() => null)]).nullable().optional(),
});

export const settingsSchema = z.object({
  business_name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(120),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  email: z.string().trim().email().or(z.literal("")),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9]{2}[A-Z0-9]{13}$/, "GSTIN must be 15 characters"),
  tax_enabled: z.coerce.boolean(),
  tax_label: z.string().trim().min(1).max(20),
  tax_rate: z.coerce.number().min(0).max(100),
  invoice_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/),
  receipt_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/),
  staff_max_discount_percent: z.coerce.number().min(0).max(100),
  enforce_credit_limit: z.coerce.boolean(),
  large_credit_threshold: z.coerce.number().min(0),
  upi_id: z.string().trim().max(80),
  bank_details: z.string().trim().max(300),
  invoice_terms: z.string().trim().max(500),
});
