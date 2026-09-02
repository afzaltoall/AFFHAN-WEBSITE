"use client";

import { CustomerList } from "@/components/admin/CustomerList";

/**
 * Every customer account, whichever client they use.
 *
 * The starting point rather than a third thing: sessions expire, so an account
 * that has not signed in for a while drops off both of the filtered lists and
 * would otherwise be unreachable.
 */
export default function AllUsersPage() {
  return (
    <CustomerList
      platform={null}
      title="Customer Accounts"
      blurb="everyone, website and app"
    />
  );
}
