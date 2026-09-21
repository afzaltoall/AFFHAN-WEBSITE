import { Suspense } from "react";
import { prisma, withDbRetry } from "@/lib/prisma";
import { OFFICES } from "@/lib/brand";
import { LiveDeskStats, type DeskStat } from "@/components/ui/LiveDeskStats";
import { EmployeeLoginForm } from "./EmployeeLoginForm";

/**
 * The staff door.
 *
 * A server component now, so the figures on the left panel are real. They are
 * counted here, in the page's own render, and handed to the shell as already-
 * resolved numbers — the browser gets them inside the HTML, so the redesign
 * adds no client fetch, no loading state and no request to a page whose whole
 * job is to be fast and boring.
 *
 * WHAT IS COUNTED, and what deliberately is not. This route is public: no
 * cookie, no session, anyone can open it. So the figures are the ones the site
 * already publishes — the catalogue and category counts are on the homepage
 * and every location page, the office and country counts are in the footer of
 * all twenty pages. Leads, inquiries, customers and the rotation queue are NOT
 * here and must not be added: they are the company's trading volume, and this
 * is a screen strangers can look at.
 *
 * Hourly, like the location pages that run the same two counts. A staff login
 * does not need a catalogue figure fresher than that, and it keeps the page
 * cacheable rather than hitting the database on every visit.
 */
export const revalidate = 3600;

/** Failing to count must not fail the login page; it just drops the strip. */
async function deskStats(): Promise<DeskStat[] | null> {
  try {
    const [products, categories] = await withDbRetry(() =>
      Promise.all([
        prisma.product.count(),
        prisma.category.count({ where: { products: { some: {} } } }),
      ]),
    );
    return [
      { label: "Products sourced", value: products },
      { label: "Categories", value: categories },
      // Both already stated publicly: the offices in the footer, the reach in
      // the homepage description ("100+ countries").
      { label: "Offices", value: Object.keys(OFFICES).length },
      { label: "Countries served", value: 100, suffix: "+" },
    ];
  } catch (error) {
    console.error(
      "employee login stats failed:",
      error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown",
    );
    return null;
  }
}

export default async function EmployeeLoginPage() {
  const stats = await deskStats();

  return (
    // useSearchParams inside the form needs a Suspense boundary to keep the
    // route static-friendly. Unchanged from before the split.
    <Suspense fallback={null}>
      <EmployeeLoginForm stats={stats ? <LiveDeskStats stats={stats} /> : undefined} />
    </Suspense>
  );
}
