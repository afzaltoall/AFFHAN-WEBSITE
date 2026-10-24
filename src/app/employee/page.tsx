import { redirect } from "next/navigation";
import { readWorkspaceAuth, workspaceHome } from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/** /employee is a signpost, not a page: workspace if signed in, login if not. */
export default async function EmployeeIndexPage() {
  const auth = await readWorkspaceAuth();
  // An assigner's workspace starts at cargo tracking, a salesperson's at their leads (Employee.job).
  redirect(!auth.ok ? "/employee/login/" : auth.kind === "employee" ? workspaceHome(auth.employee) : "/employee/dashboard/");
}
