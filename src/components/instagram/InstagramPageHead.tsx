import Link from "next/link";
import { ReferralRefresh } from "@/components/employee/ReferralRefresh";
import { wt } from "@/components/employee/workspace-ui";
import { instagramTaskDates, instagramTaskLine, instagramTaskRunning, type InstagramSettingsView } from "@/lib/instagram-task-shared";

const fmtTime = (at: Date) => at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** The Instagram task's staff pages, their heading: the task in one line, its dates, whether it is closed. */
export function InstagramPageHead({ settings, refresh = true }: { settings: InstagramSettingsView; refresh?: boolean }) {
  const dates = instagramTaskDates(settings);
  const running = instagramTaskRunning(settings);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Instagram task</h1>
        {refresh && <ReferralRefresh />}
      </div>
      <p className={`mt-1 text-[14px] leading-snug sm:text-[13px] ${wt.mid}`}>
        {instagramTaskLine(settings)}
        {dates ? ` · ${dates}` : ""}
        {!running && <span className="font-semibold text-red-600"> · Closed: accounts can&apos;t be added or changed</span>}
      </p>
      {refresh && <p className={`mt-0.5 text-[12.5px] ${wt.mid}`}>Updated {fmtTime(new Date())}</p>}
    </div>
  );
}

/** What an administrator looking into the staff workspace is shown: everyone is in the console. */
export function InstagramAdminNote() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Instagram task</h1>
      <p className={`text-[14px] ${wt.mid}`}>
        Administrators have no accounts of their own here. Everyone&apos;s accounts, the checks and the prizes are in the console:{" "}
        <Link href="/admin/instagram-task/" className="font-semibold text-brand-dark hover:underline">
          Instagram task
        </Link>
        .
      </p>
    </div>
  );
}

/** A database the task's migration has not reached yet. */
export function InstagramNotSetUp() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Instagram task</h1>
      <p className={`text-[14px] ${wt.mid}`}>The Instagram task isn&apos;t set up on this database yet.</p>
    </div>
  );
}
