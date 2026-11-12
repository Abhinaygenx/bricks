import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Boxes, Factory, History, FileText, Users, Wallet, BookOpen, BarChart3, UserCog, ShieldCheck, Settings,
  FilePlus2, UserRound, Bell,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/admin/invoices", label: "Invoices", icon: FileText, mobile: true },
  { href: "/admin/invoices/new", label: "New Invoice", icon: FilePlus2 },
  { href: "/admin/customers", label: "Customers", icon: Users, mobile: true },
  { href: "/admin/accounts", label: "Credit Accounts", icon: BookOpen },
  { href: "/admin/payments", label: "Payments", icon: Wallet, mobile: true },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes, mobile: true },
  { href: "/admin/inventory/production", label: "Production", icon: Factory },
  { href: "/admin/inventory/stock-history", label: "Stock Ledger", icon: History },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/staff", label: "Staff", icon: UserCog },
  { href: "/admin/audit-logs", label: "Audit & Alerts", icon: ShieldCheck },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export const STAFF_NAV: NavItem[] = [
  { href: "/staff/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/staff/new-invoice", label: "New Invoice", icon: FilePlus2, mobile: true },
  { href: "/staff/invoices", label: "My Invoices", icon: FileText, mobile: true },
  { href: "/staff/customers", label: "Customers", icon: Users, mobile: true },
  { href: "/staff/payments", label: "Payments", icon: Wallet, mobile: true },
  { href: "/staff/profile", label: "Profile", icon: UserRound },
];
