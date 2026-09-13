import { OFFICES } from "@/lib/brand";

/**
 * The open roles, in one place.
 *
 * These used to live inside `prisma-roles.tsx`, which is a client component —
 * so the careers layout could not read them to emit JobPosting markup without
 * duplicating the list, and a duplicated list is one that eventually disagrees
 * with itself. Same extraction as `src/lib/rankings.ts`: the data moves to a
 * plain module, the component keeps the rendering.
 *
 * `offices` names keys in OFFICES rather than repeating the cities, so a job's
 * location and the address in the schema can never drift apart. The visible
 * card label is derived from them.
 */
export type CareerRole = {
  /** Also the DOM id (`role-01`) and the schema identifier. */
  id: string;
  title: string;
  /** Keys of OFFICES. First one is the primary location. */
  offices: (keyof typeof OFFICES)[];
  features: string[];
};

/**
 * The day this list was last confirmed accurate — NOT a decorative constant.
 *
 * Google reads it as `datePosted` and treats stale postings as a quality
 * problem, so it has to be moved whenever the roles below change. There is
 * deliberately no `validThrough`: these are standing roles with no closing
 * date, and Google's guidance is to omit the property rather than invent one.
 */
export const ROLES_CONFIRMED_ON = "2026-09-13";

export const ROLES: CareerRole[] = [
  {
    id: "01",
    title: "Sourcing Specialist",
    offices: ["guangzhou", "chennai"],
    features: [
      "Build and manage Chinese supplier relationships",
      "Negotiate pricing, MOQs and lead times",
      "Source products to match client requirements",
    ],
  },
  {
    id: "02",
    title: "Quality Control Inspector",
    offices: ["guangzhou"],
    features: [
      "Conduct on-site factory inspections and audits",
      "Enforce international compliance standards",
      "Document defects and drive corrective action",
    ],
  },
  {
    id: "03",
    title: "Logistics & Freight Coordinator",
    offices: ["chennai", "dubai"],
    features: [
      "Oversee end-to-end freight and forwarding",
      "Optimise sea, air and multimodal routing",
      "Handle customs clearance and documentation",
    ],
  },
  {
    id: "04",
    title: "B2B Account Manager",
    offices: ["uk", "singapore"],
    features: [
      "Own client relationships from inquiry to delivery",
      "Turn quote requests into sourced orders",
      "Grow accounts across global markets",
    ],
  },
];

/**
 * What a candidate would call the place, where that differs from the postal
 * locality. The UK office is in Mitcham, which is the correct thing to put in
 * a PostalAddress and the wrong thing to put on a job card — nobody searches
 * for work in Mitcham, and the card has always said London.
 */
const CITY_LABEL: Partial<Record<keyof typeof OFFICES, string>> = {
  uk: "London",
};

/** "Guangzhou / Chennai" — what the card prints under the job title. */
export function roleLocationLabel(role: CareerRole): string {
  return role.offices
    .map((key) => CITY_LABEL[key] ?? OFFICES[key].address.addressLocality)
    .join(" / ");
}
