import { redirect } from "next/navigation";
import { readWorkspaceAuth } from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/** /employee is a signpost, not a page: workspace if signed in, login if not. */
export default async function EmployeeIndexPage() {
  const auth = await readWorkspaceAuth();
  redirect(auth.ok ? "/employee/dashboard/" : "/employee/login/");
}
