"use client";

import { CustomerList } from "@/components/admin/CustomerList";

/** Customers who have signed in through the Android app. */
export default function AppUsersPage() {
  return (
    <CustomerList
      platform="APP"
      title="App Users"
      blurb="signed in from the mobile app"
    />
  );
}
