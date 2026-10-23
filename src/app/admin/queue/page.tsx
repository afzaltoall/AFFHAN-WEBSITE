import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Queue page has gone (the owner, 2026-10-22). What it showed lives on the console's own lists now: who holds
 * whom and when they go back by themselves on each row's chip, Release to pool in the popup, the customers given up
 * on under the Invalid filter. An old bookmark lands on the inquiries waiting in the open pool.
 *
 * Outside the console's route group on purpose: a redirect needs none of its layout's work.
 */
export default function QueueGone(): never {
  redirect("/admin/?view=inquiries&handling=open");
}
