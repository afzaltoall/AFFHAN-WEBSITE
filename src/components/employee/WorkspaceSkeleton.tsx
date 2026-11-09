import { wt } from "@/components/employee/workspace-ui";

/** Each staff page's own title, so its outline already says where you are going. */
const TITLES: Record<string, string> = {
  "/employee/referrals": "My referrals",
  "/employee/profile": "Profile",
  "/employee/dashboard": "My leads",
  "/employee/cargo": "Cargo tracking",
};

const bar = "animate-pulse rounded-full bg-black/[0.06] motion-reduce:animate-none";

/**
 * A staff page's outline while it is on its way (2026-11-09): its title at once, as it will stand, and grey blocks
 * where its cards will be. Shown the moment a tab or the rail is pressed (WorkspaceMain), never as a page's
 * loading.tsx: those were tried the same day and taken out. A page with one answers before it has decided anything, so
 * My leads and Cargo tracking sent a referral account to My referrals with a 200 and a script instead of a redirect, and
 * React holds a loading screen at least ~300 ms, so a move the server answered in 20 ms took 330.
 */
export function WorkspaceSkeleton({ path }: { path: string }) {
  const title = TITLES[path.replace(/\/+$/, "")] ?? null;
  return (
    <div data-workspace-loading="" aria-busy="true" className="space-y-5">
      <span className="sr-only" role="status">
        Loading{title ? ` ${title}` : ""}…
      </span>
      <div>
        <div className="flex min-h-10 items-center justify-between gap-3">
          {title ? <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1> : <div className={`h-7 w-40 ${bar}`} />}
          <div className={`h-10 w-[7.5rem] sm:h-9 ${bar}`} />
        </div>
        <div className={`mt-2.5 h-3.5 w-64 max-w-full ${bar}`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={`space-y-3.5 rounded-2xl p-5 ${wt.card}`}>
            <div className={`h-3.5 w-24 ${bar}`} />
            <div className={`h-11 rounded-xl ${bar}`} />
            <div className={`h-3.5 w-3/4 ${bar}`} />
            <div className={`h-11 ${bar}`} />
          </div>
        ))}
      </div>
      <div className={`space-y-3 rounded-2xl p-5 ${wt.card}`}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-9 rounded-xl ${bar}`} />
        ))}
      </div>
    </div>
  );
}

export default WorkspaceSkeleton;
