"use client";

import { CustomerList } from "@/components/admin/CustomerList";

/** Customers who have signed in through the website. */
export default function WebsiteUsersPage() {
  return (
    <CustomerList
      platform="WEB"
      title="Website Users"
      blurb="signed in from a browser"
    />
  );
}
