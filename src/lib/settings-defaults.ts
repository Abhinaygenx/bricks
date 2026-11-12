// Shared (client/server/tests) settings shape and defaults. No server-only imports here.
export type BusinessSettings = {
  business_name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  logo_url: string | null;
  tax_enabled: boolean;
  tax_label: string;
  tax_rate: number;
  invoice_prefix: string;
  receipt_prefix: string;
  staff_max_discount_percent: number;
  enforce_credit_limit: boolean;
  large_credit_threshold: number;
  upi_id: string | null;
  bank_details: string | null;
  invoice_terms: string;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  business_name: "VABANI BRICKS",
  tagline: "Brick Manufacturing & Supply",
  address: "",
  phone: "",
  email: null,
  gstin: null,
  logo_url: null,
  tax_enabled: false,
  tax_label: "GST",
  tax_rate: 0,
  invoice_prefix: "VB",
  receipt_prefix: "RC",
  staff_max_discount_percent: 2,
  enforce_credit_limit: true,
  large_credit_threshold: 50000,
  upi_id: null,
  bank_details: null,
  invoice_terms: "",
};
