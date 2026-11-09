import { WorkspaceSkeleton } from "@/components/employee/WorkspaceSkeleton";

/** Shown at once while this page is read from the server; the live site fetches it ahead (2026-11-09). */
export default function Loading() {
  return <WorkspaceSkeleton path="/employee/referrals" />;
}
