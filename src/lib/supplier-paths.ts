/**
 * The supplier portal's pages: /supplier and everything under it. A separate door from the shop's (the owner,
 * 2026-10-23: separate accounts, separate sessions, separate logins, no crossing either way), so the shop's
 * customer sign-in is neither asked for nor held on them (context/AuthContext.tsx).
 */
export const isSupplierPath = (pathname: string) => pathname === "/supplier" || pathname.startsWith("/supplier/");
