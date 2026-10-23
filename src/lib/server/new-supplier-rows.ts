import "server-only";
import type { Prisma } from "@prisma/client";
import { isOfferStatus } from "@/lib/supplier-offer";
import type { BoardAccount, BoardOffer } from "@/components/admin/new-suppliers-shared";

/**
 * The supplier portal's rows as New Suppliers and a new supplier's own page hand them to the browser: what each
 * page reads (OFFER_INCLUDE, ACCOUNT_SELECT) and how a row becomes a BoardOffer or BoardAccount, kept in one place
 * so the board and the page can never describe the same supplier differently.
 */

export const OFFER_INCLUDE = { supplier: { select: { id: true, email: true, status: true } } } as const;

export const ACCOUNT_SELECT = {
  id: true,
  email: true,
  name: true,
  mobile: true,
  companyName: true,
  wechatId: true,
  companyAddress: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { offers: true } },
} as const;

type OfferRow = Prisma.SupplierOfferGetPayload<{ include: typeof OFFER_INCLUDE }>;
type AccountRow = Prisma.SupplierAccountGetPayload<{ select: typeof ACCOUNT_SELECT }>;

export function toBoardOffer(o: OfferRow): BoardOffer {
  return {
    id: o.id,
    productId: o.productId,
    productName: o.productName,
    productImage: o.productImage,
    categoryName: o.categoryName,
    moq: o.moq,
    moqUnit: o.moqUnit,
    details: o.details,
    photos: o.photos,
    contactName: o.contactName,
    companyName: o.companyName,
    mobile: o.mobile,
    wechatId: o.wechatId,
    companyAddress: o.companyAddress,
    status: isOfferStatus(o.status) ? o.status : "NEW",
    reply: o.reply,
    reviewedAt: o.reviewedAt?.toISOString() ?? null,
    reviewedBy: o.reviewedBy,
    createdAt: o.createdAt.toISOString(),
    supplierId: o.supplier.id,
    supplierEmail: o.supplier.email,
    supplierBlocked: o.supplier.status !== "ACTIVE",
  };
}

export function toBoardAccount(a: AccountRow): BoardAccount {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    mobile: a.mobile,
    companyName: a.companyName,
    wechatId: a.wechatId,
    companyAddress: a.companyAddress,
    status: a.status === "BLOCKED" ? "BLOCKED" : "ACTIVE",
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    offers: a._count.offers,
  };
}
