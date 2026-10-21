import { cache } from "react";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authSecret, authSecretOrNull } from "@/lib/secrets";
import { readSupplierToken, signSupplierToken, SUPPLIER_TOKEN_MAX_AGE_MS } from "@/lib/supplier-token";

// ---------------------------------------------------------------------------
// Supplier sessions (the supplier portal, 2026-10-21).
//
// A cookie of its own, as the staff desk has (lib/employee-session.ts), so a
// supplier signing in never touches a customer's, a member of staff's or an
// admin's session in the same browser. The token is lib/supplier-token.ts's,
// signed with a key of its own; this adds the check a signature cannot make
// alone: the account still exists, is not blocked, and is on the tokenVersion
// the cookie was signed with. One lookup by primary key per guarded request,
// the price the staff and admin sessions already pay.
//
// No idle timeout: a supplier is an outside business checking back now and
// then, like a customer, so the session lasts thirty days, as a customer's
// does. Lax rather than strict, as the customer cookie is (mobile-auth.ts): a
// supplier following a link to the portal from WeChat or an email arrives
// signed in, and cross-site POSTs still carry no cookie.
// ---------------------------------------------------------------------------

export const SUPPLIER_COOKIE = "affhan_supplier";

export const supplierCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(SUPPLIER_TOKEN_MAX_AGE_MS / 1000),
};

/** What a signed-in page or route knows about the supplier. Never the password hash. */
export interface SupplierIdentity {
  id: string;
  email: string;
  name: string;
  mobile: string;
  /** Null until the first application asks for them. */
  companyName: string | null;
  wechatId: string | null;
  companyAddress: string | null;
  createdAt: Date;
}

const IDENTITY_FIELDS = {
  id: true,
  email: true,
  name: true,
  companyName: true,
  mobile: true,
  wechatId: true,
  companyAddress: true,
  createdAt: true,
  status: true,
  tokenVersion: true,
} as const;

/** The supplier a cookie value stands for, or null. Signature first: nothing reaches the database before it. */
export async function authoriseSupplierToken(token: string | undefined): Promise<SupplierIdentity | null> {
  const claims = readSupplierToken(token, authSecretOrNull());
  if (!claims) return null;
  const row = await prisma.supplierAccount.findUnique({ where: { id: claims.id }, select: IDENTITY_FIELDS });
  if (!row || row.status !== "ACTIVE" || row.tokenVersion !== claims.tokenVersion) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    companyName: row.companyName,
    mobile: row.mobile,
    wechatId: row.wechatId,
    companyAddress: row.companyAddress,
    createdAt: row.createdAt,
  };
}

/** The signed-in supplier, from the request's cookies. */
export async function readSupplier(): Promise<SupplierIdentity | null> {
  const store = await cookies();
  return authoriseSupplierToken(store.get(SUPPLIER_COOKIE)?.value);
}

/** readSupplier for pages: the portal's layout and its page both ask, and React keeps one lookup per request. */
export const currentSupplier = cache(readSupplier);

/** Sign this account in on the response. Throws SecretMissingError without AUTH_SECRET, as every signer does. */
export function setSupplierCookie(res: NextResponse, account: { id: string; tokenVersion: number }): NextResponse {
  res.cookies.set(
    SUPPLIER_COOKIE,
    signSupplierToken({ id: account.id, tokenVersion: account.tokenVersion }, authSecret()),
    supplierCookieOptions,
  );
  return res;
}

export function clearSupplierCookie(res: NextResponse): NextResponse {
  res.cookies.set(SUPPLIER_COOKIE, "", { ...supplierCookieOptions, maxAge: 0 });
  return res;
}
