import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import type { OfferStatus } from "@/lib/supplier-offer";
import type { ContactEntry, PhoneView } from "@/lib/suppliers";

/**
 * What New Suppliers (the board, NewSuppliersBoard) and a new supplier's own page (NewSupplierDetail) share: the
 * rows as the pages hand them down (lib/server/new-supplier-rows.ts makes them), the console's two themes as class
 * tokens (the values the Old Suppliers book and its supplier page use), the colour of each application's status,
 * and how dates and numbers are written.
 */

export interface BoardOffer {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  categoryName: string | null;
  moq: number;
  moqUnit: string;
  details: string;
  photos: string[];
  contactName: string;
  companyName: string;
  mobile: string;
  wechatId: string;
  companyAddress: string;
  status: OfferStatus;
  reply: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  supplierId: string;
  supplierEmail: string;
  supplierBlocked: boolean;
}

export interface BoardAccount {
  id: string;
  email: string;
  name: string;
  mobile: string;
  companyName: string | null;
  wechatId: string | null;
  companyAddress: string | null;
  status: "ACTIVE" | "BLOCKED";
  lastLoginAt: string | null;
  createdAt: string;
  offers: number;
}

export type NewSupplierTheme = Record<
  "page" | "card" | "soft" | "body2" | "border" | "divide" | "hover" | "input" | "pill" | "pillOn" | "head" | "bar" | "sheet" | "well" | "ink" | "chip",
  string
>;

export function newSupplierTheme(dark: boolean): NewSupplierTheme {
  return dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", card: "bg-[#151517] ring-white/[0.08]",
        soft: "text-[#8a8a8e]", body2: "text-[#b5b5ba]",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]",
        hover: "hover:bg-white/[0.03]", input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
        pillOn: "bg-white text-[#1d1d1f] ring-transparent", head: "bg-white/[0.03]",
        bar: "bg-[#151517]/90 border-white/10", sheet: "bg-[#0f0f11]", well: "bg-white/[0.04]", ink: "text-[#f2f2f4]",
        chip: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", card: "bg-white ring-black/[0.04]",
        soft: "text-[#6e6e73]", body2: "text-[#4e4e53]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]",
        hover: "hover:bg-black/[0.015]", input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
        pillOn: "bg-[#1d1d1f] text-white ring-transparent", head: "bg-black/[0.02]",
        bar: "bg-white/80 border-black/[0.06]", sheet: "bg-[#f5f5f7]", well: "bg-black/[0.03]", ink: "text-[#1d1d1f]",
        chip: "bg-black/[0.04] text-[#1d1d1f] ring-black/[0.06]",
      };
}

/** Where an application stands, as a chip's colours: the same in the row, on the supplier's page and in the inquiry. */
export function offerTone(dark: boolean): Record<OfferStatus, string> {
  return dark
    ? {
        NEW: "bg-[#0a84ff]/15 text-[#64a8ff]",
        REVIEWING: "bg-amber-400/15 text-amber-300",
        ACCEPTED: "bg-emerald-400/15 text-emerald-300",
        REJECTED: "bg-white/[0.08] text-[#c7c7cc]",
        WITHDRAWN: "bg-white/[0.05] text-[#8a8a8e]",
      }
    : {
        NEW: "bg-[#0071e3]/10 text-[#0058b0]",
        REVIEWING: "bg-amber-500/15 text-amber-800",
        ACCEPTED: "bg-emerald-500/10 text-emerald-700",
        REJECTED: "bg-black/[0.06] text-[#48484a]",
        WITHDRAWN: "bg-black/[0.04] text-[#86868b]",
      };
}

export const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** "+86 138 0013 8000" for the eye; the E.164 underneath for tel: and wa.me. */
export const spaced = (e164: string) => parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;

/** A supplier's mobile and WeChat ID as SupplierContacts takes them (the book's PhoneView and ContactEntry). */
export const phoneOf = (e164: string): PhoneView[] => [{ value: spaced(e164), label: null, tags: [], e164, assumed: false, incomplete: false }];
export const wechatOf = (id: string | null): ContactEntry[] => (id ? [{ value: id, label: "WeChat ID", tags: [] }] : []);

/** A sentence for the board to show once it is back: a supplier deleted from their own page. */
export const NOTICE_KEY = "affhan:new-suppliers:notice";
